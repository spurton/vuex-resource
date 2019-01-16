import axios from "@/axios";
import { schema, normalize, denormalize } from "normalizr";
import pluralize from "pluralize";

// The different states
const INITIAL_STATUS = "INITIAL";
const LOADING_STATUS = "LOADING";
const UPDATING_STATUS = "UPDATING";
const DELETING_STATUS = "DELETING";
const CREATING_STATUS = "CREATING";
const ERROR_STATUS = "ERROR";
const SUCCESS_STATUS = "SUCCESS";

const SET = "SET";
const SET_STATUS = "SET_STATUS";
const SET_ERROR = "SET_ERROR";
const SET_RESOURCES = "SET_RESOURCES";
const ADD_RESOURCE = "ADD_RESOURCE";
const DELETE_RESOURCE = "DELETE_RESOURCE";
const MODIFY_RESOURCE = "MODIFY_RESOURCE";

// These are used to not pollute the Vue tools Vuex state. 
const _urlSymbol = Symbol("fullUrl");
const _clientSymbol = Symbol("client");
const _commitSymbol = Symbol("commit");
const _resourceSymbol = Symbol("resource");
const _stateSymbol = Symbol("state");
const _internalIdSymbol = Symbol("internalId");
const _resourceIdentifierSymbol = Symbol("resourceIdentifier");

// Resource obj states
const NEW = "NEW";
const SAVED = "SAVED";

// Memory efficient client-side ids. 
let internalResourceId = new WeakMap, id = 0; 

class Resource {
    constructor(initialObj, fullUrl, resourceName, client, commit, identifier, state=NEW) {
        if (state === NEW) {
            this[_urlSymbol] = `${fullUrl}/`;
        } else {
            this[_urlSymbol] = `${fullUrl}/${initialObj[identifier]}`;
        }

        internalResourceId.set(this, id++); // Increment the id on every instance client-side

        this[_clientSymbol] = client;
        this[_commitSymbol] = commit;
        this[_resourceSymbol] = resourceName;
        this[_stateSymbol] = state;
        this[_internalIdSymbol] = internalResourceId.get(this);
        this[_resourceIdentifierSymbol] = identifier;

        Object.keys(initialObj).map(key => {
            this[key] = initialObj[key];
        });
    }

    save = async() => {
        if (!(this[_stateSymbol] === NEW)) {
            try {
                this[_commitSymbol](SET_STATUS, UPDATING_STATUS);
                let { data } = await this[_clientSymbol].put(this[_urlSymbol], this);
                this[_commitSymbol](SET_STATUS, SUCCESS_STATUS);

                Object.assign(this, data);
                this[_commitSymbol](MODIFY_RESOURCE, this);
            } catch (error) {
                this[_commitSymbol](SET_STATUS, ERROR_STATUS);
                this[_commitSymbol](SET_ERROR, error);
            }
        } else {
            try {
                this[_commitSymbol](SET_STATUS, CREATING_STATUS);
                let { data } = await this[_clientSymbol].post(this[_urlSymbol], this);
                this[_commitSymbol](SET_STATUS, SUCCESS_STATUS);

                Object.assign(this, data);
                this[_commitSymbol](MODIFY_RESOURCE, this);
                this[_stateSymbol] = SAVED; // We can directly set this as it's not tracked by Vuex
            } catch (error) {
                this[_commitSymbol](SET_STATUS, ERROR_STATUS);
                this[_commitSymbol](SET_ERROR, error);
            }
        }
    }

    delete = async() => {
        try {
            this[_commitSymbol](SET_STATUS, DELETING_STATUS);
            await this[_clientSymbol].delete(this.fullUrl);
            this[_commitSymbol](SET_STATUS, SUCCESS_STATUS);
            this[_commitSymbol](DELETE_RESOURCE, this[_resourceIdentifierSymbol]);
        } catch (error) {
            this[_commitSymbol](SET_STATUS, ERROR_STATUS);
            this[_commitSymbol](SET_ERROR, error); // TODO: These are error objects, set the string
        }
    }

    set = (attribute, value) => {
        this[_commitSymbol](SET, { resourceId: this[_internalIdSymbol], attribute, value });
    }
}

const createResourceModule = (resourceName, baseURL, identifier="id") => {
    const client = axios.create({ baseURL });
    const recordSchema = new schema.Entity(resourceName, {}, { idAttribute: _internalIdSymbol });
    const recordListSchema = [recordSchema];

    // This lets you pass in { parent: 2, child: 1 }
    // Which returns /parent/2/child/1
    const generatePath = (pathObj) => {
        const path = Object.keys(pathObj).reduce((path, resourceName) => {            
            return path + `/${pluralize(resourceName)}/${pathObj[resourceName]}`;
        }, "");

        return `${path}/${resourceName}`;
    };

    const removeFromArray = (arr, item) => {
        return arr.filter(element => element !== item);
    };

    // This creates a blank object based on an existing resource
    const generateFromResource = template => {
        return Object.entries(template).reduce((newObj, pair) => {
            let type = typeof pair[1];
            const isArray = Array.isArray(pair[1]);
            if (isArray) {
                type = "array";
            }

            const types = {
                "array": Array,
                "number": Number,
                "string": String
            };

            if (Object.keys(types).includes(type)) {
                newObj[pair[0]] = new types[type]();
            }

            return newObj;
        }, {});
    };

    const normalizeResource = resource => {
        const resSchema = new schema.Entity(resourceName, {}, { idAttribute: _internalIdSymbol });
        return normalize(resource, resSchema);
    };

    return {
        state: {
            byId: {},
            allIds: [],
            status: INITIAL_STATUS,
            error: ""
        },

        mutations: {
            [SET_STATUS]:(state, status) => {
                state.status = status;
            },

            [SET_ERROR]:(state, error) => {
                state.error = error;
            },

            [SET_RESOURCES]:(state, { data, schema }) => {
                const { entities, result } = normalize(data, schema);
                state.byId = entities[resourceName];
                state.allIds = result;
            },

            [SET]:(state, { resourceId, attribute, value }) => {
                state.byId[resourceId][attribute] = value;
            },

            [ADD_RESOURCE]:(state, resource) => {
                const normalized = normalizeResource(resource);
                
                Object.assign(state.byId, normalized.entities[resourceName]);
                state.allIds.push(normalized.result);
            },

            [DELETE_RESOURCE]:(state, id) => {
                state.allIds = removeFromArray(state.allIds, id);
                delete state.byId[id]; //NOTE: Not sure if this breaks reactivity?
            },

            [MODIFY_RESOURCE]:(state, resource) => {
                const normalized = normalizeResource(resource);

                Object.assign(state.byId, normalized.entities[resourceName]);
            }
        },

        actions: {
            async fetchResources({ commit }, pathObj={}) {
                const fullUrl = generatePath(pathObj); // TODO: write tests, see if this breaks on {}

                try {
                    commit(SET_STATUS, LOADING_STATUS);
                    
                    let { data } = await client.get(fullUrl);

                    const convertedData = data[resourceName].map(item => new Resource(item, fullUrl, resourceName, client, commit, identifier, SAVED));

                    commit(SET_RESOURCES, { data: convertedData, schema: recordListSchema });
                    commit(SET_STATUS, SUCCESS_STATUS);
                } catch (error) {                    
                    commit(SET_STATUS, ERROR_STATUS);
                    commit(SET_ERROR, error);
                }
            },

            newResource({ commit }, { pathObj, attributes, existingResource }) {
                const fullUrl = generatePath(pathObj);
                let resource = null;

                if (attributes) {
                    resource = new Resource(attributes, fullUrl, resourceName, client, commit, identifier);
                } else if (existingResource) {
                    resource = new Resource(generateFromResource(existingResource), fullUrl, resourceName, client, commit, identifier);
                } else {
                    resource = new Resource({}, fullUrl, resourceName, client, commit, identifier);
                }

                commit(ADD_RESOURCE, resource);

                return resource;
            }
        },

        getters: {
            all: state => state.allIds.map(id => state.byId[id]),
            denormalized: state => denormalize(state.byId, recordListSchema),
            loading: state => state.status === LOADING_STATUS,
            updating: state => state.status === UPDATING_STATUS,
            hasError: state => state.error !== ""
        },

        namespaced: true
    };
};

export {
    createResourceModule
};