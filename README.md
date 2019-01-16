# ResourceModule

A library that standardizes resource CRUD with the ability to customize nested resources, the resource record identifier and custom URLs.

## Usage inside Vuex.Store initializer:

First you need to import the module:

```
import { createResourceModule } from "resource";
```

Then in your name-spaced state, use it to create the state store: example “links” state

```
links: createResourceModule("links", "/api/", "_id")
```

A little about the arguments. The first argument is the resource name. the second is the base URL. The last is the resource identifier. Since we use MongoDb we use “_id”. It defaults to “id” (the normal relational db primary key identifier).

So to create a different resource in state of “comments” with a base URL of “v2” you could do:

```
comments: createResourceModule("comments", "/api/v2", "_id")
```

# So what do you get when you use this module?

First of all you get some actions that help you start working with your resource. In particular **fetchResources** and **newResource**. Lets take a look at what those do!

## fetchResources

This action will fetch a list of resources. In our links example since the resource is a nested resource, the resulting URL will be something like: 

```
http://localhost:8081/api/applications/584f44f83d3ed43acc4a15fb/nodes/5bef564942fa9f869c45e2cf/links

```

So, how do we get that full URL? We dispatch the action and pass some helpful data along. The argument you pass in is an object that represents the nested resource parents by key and value. Example:

```
dispatch("links/fetchResources", { application: node.application, node: node._id }, { root: true });
```

Notice the application key has a value of the application and the node has the node id value. These are evaluated by nesting, left to right. It also pluralizes the keys to properly represent a resource URL.

## newResource

This is used to create a blank slate resource to work with and add values then save to the API? The blank resource is tracked in Vuex state so you don't have to do anything special in the UI. Here is how you initialize a new resource with attributes:

```
const res = await this.newResource({ pathObj: { application: this.selectedApplication, node: this.applications[this.selectedApplication].staggedStartNode }, attributes: {
                name: "Some Name",
                title: "Great link",
                url: "http://pinterest.com"
            }});
```

Here we pass in the pathObj as we saw before. Everything you pass in with the attributes property get set on the object and are reactive. They could be empty strings, or whatever you need.

# Saving a Resource

Saving data is incredibly simple. ResourceModule keeps track of the resource data and knows how to save itself. In order to modify, then save the resulting data. From our links example. If we have a link object. We get a save method we can use. It's as simple as calling .save() on the resource.

```
await link.save();
```

# Deleting a Resource

Since we are tracking resource data on the objects. Deleting is just as easy. All you need to do is call the .delete() method:

```
await link.delete();
```

Both Save and Delete use Vuex commit mutations.

# Modifying a Resource

We want to use mutations to modify the attributes of a resource. To do so you call the .set() method on a resource:

```
link.set("url", "http://www.google.com");
```

This will call the built-in mutations and set the state of the object using Vuex mutations. This works well using a two-way computed property like so:

```
computed: {
    link: {
        get() {
            return this.link; //Assuming you passed link in as a prop
        },
        set(value) {
            this.link.set("attributeName", value); // This will automatically use mutations
        }
    }
}
 
```

# Under the hood:

### Normalizr:

We are using the normalizr lib to standardize how we store the data in Vuex state. As well as name-spaced modules in Vuex.

### ID tracking

We are not tracking the actual resource id in state. If you look at your Vuex state for these resources. It looks like array numbers: {0,1,2} as keys. The keys are unique ids generated at runtime in the client. This allows us to add blank (new) resources that have not been saved via the RESTful API yet.

### Resource state

To make the data normalized we have the following structure:

* byId => returns the normalized data where each object is a property
* allIds => returns an array of all ids which can be used in retrieving a resource in byId
* status => returns the status of the resource which is updated during actions
* error => returns the last error (if there is one)

### Getters

We have added some handy getters to use:

* all => returns an array of the resources 
* denormalized => returns the resources as they are in the resources response from the API
* loading => returns true if the resource is loading.  This is updated during certain actions
* updating => returns true if the resource is updating. This is updated during certain actions
* hasError => returns true if there is an error


