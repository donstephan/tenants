# Tenants
Mongo remote collection driver to provide multi-tenancy support in Meteor Applications.

```
meteor add donstephan:tenants
```

### Setup

Start by initializing your tenants on startup. This provides a key, value lookup to initialize the tenants remote connection string.
```
Tenants.set({
  "tenant_1": "mongodb://127.0.0.1:3001/tenant_1",
  "tenant_2": process.env.TENANT_2,
  ...
});
```

Use collections as you normally would on the server and client:
```
const Links = new Mongo.Collection('links');

// inserts into your default tenant (i.e. MONGO_URL)
Links.insert({ name: "Bema Technologies", url: "https://bema.dev" });

// inserts into another tenant you set up, see above
Links.from("tenant_1").insert({ name: "Meteor", url: "https://meteor.com" });

const tenantLinks = Links.from("tenant_1").findOne();
// { name: "Meteor", url: "https://meteor.com" }

// example publish
Meteor.publish("tenants", () => {
  return [
    Links.find({}), // publish all links from main db
    Links.from("tenant_1").find({}) // publish links from tenant
  ]
})
```

### Why tenants?
Sometimes you really do need data separations in seprate Mongo databases and/or clusters. Tenants makes this really easy to segement all while utilizing the very helpful collection interface that Meteor provides.

### Security Note
Please note that in order to do the client side lookup of tenants `Collection.from(<tenant-name>)`, the `_tenant` collection is published to all clients. If you don't want a user to be able to see names of your tenants, use a UUID for a tenant name i.e. `6hKFY9zTpyNj5Gp6m: "mongodb://127.0.0.1:3001/tenant_1"` instead of something like `bema: "mongodb://127.0.0.1:3001/tenant_1"`. This collection is published in order to keep collection names unique. See how it works below.

### Other Notes
* Mongo indexes will not translate across tenants since they are applied on a raw collection. You will have to make sure to perform `createIndex` on each tenant collection i.e. `Links.from("tenant_1").rawCollection().createIndex({ title: 1 })` or maybe something more creative like `Tenants.get().forEach((tenant) => Links.from(tenant).rawCollection().createIndex({ title: 1 }))`.

### API
Tenants.set(tenants, disableAutoPublish, remoteConnectionOptions)
```
// see example above
**tenants**: [{ [tenantName, remoteConnectionString, ...more tenants ]}];

**disableAutoPublish**:  allowed you to disable to default publication of the tenants collection.
This effectively removes client side `from()` commands unless you explicitly publish the tenant
doc for the tenant who is trying to access the local collection. You would have to do something like:

// on the server
import { Tenants } from "meteor/donstephan:tenants";

Meteor.publish("tenant", () => Tenants.collection.find({ name: "tenant_1" }));

In order to hook up functionality for LocalCollection to be accessed for that tenant.

**remoteConnectionOptions**: Mongo driver remote connection options.
See http://mongodb.github.io/node-mongodb-native/3.0/reference/connecting/connection-settings/.
```

Tenants.get:
```
const tenants = Tenants.get();

// ["tenant_1"];
```

Tenant.collection:
```
let tenants = Tenents.collection.find({}).fetch();

/*
[
  { "_id" : "fYBqzNsBdd4kFi6S8", "name" : "tenant_1", "key" : 0 },
  { "_id" : "fYBqzNsBdd4kFi6S8", "name" : "tenant_2", "key" : 1 }
]
*/
```

### How it works
All tenants does is extends an option on the Collection class to provid references to different collectionswhen `from(<tenant-x>)` is called. In order to get by the requirement of unique single collection names(because of the internal Meteor mutation methods and to prevent tenant collection overlap), we store`_tenants` collection in the main DB. This maps a unique collection name for each tenant with a simple count. If we use the `Links` example from above, in your main db the collection name would be `links`, for `tenant_1` the collection is named `links_0`, for `tenant_2` the collection is named `links_1`, and so on and so on. 

### TODO
* Testing
* Disconnection of remote connection drivers if they are not used in a period of time i.e. we shouldn't keep alive a remote connection driver to a tenant if they have not accessed that collection in X minutes (seconds?)
  * Currently we initialize 1 connection (need to validate in terms of pool sizing). If you have 100 tenants that would be 100 extra connections. We only need connections to stay alive while a tenant is accessing collections so some sort of automated cleanup makes sense to disconnect and reconnect when needed.