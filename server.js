// Write your package code here
import { Mongo } from 'meteor/mongo';

import TenantCollection from './collection';

let tenantList = {};
let driverPool = {};
let connectionOptions = null;

export const Tenants = {
  set: function (tenants, disableAutoPublish, remoteConnectionOptions) {
    check(tenants, Object);
    Object.keys(tenants).forEach((key) => {
      if (!driverPool[key]) {
        driverPool[key] = {
          driver: null,
          lastAccessed: Date.now(),
          connected: false,
          connectionString: tenants[key],
          collections: []
        };
      }
    });

    if (remoteConnectionOptions) {
      check(remoteConnectionOptions, Object);
      connectionOptions = remoteConnectionOptions;
    }

    if (!disableAutoPublish) {
      Meteor.publish(null, () => {
        return TenantCollection.find({})
      });
    }
  },
  get: function () {
    return ["", ...Object.keys(driverPool)];
  },
  collection: TenantCollection
}

Mongo.Collection.prototype.from = function (key) {
  const context = this;
  if (!key) {
    return context;
  }

  if (!context._tenants) {
    context._tenants = {};
  }

  let tenant = tenantList[key];
  if (!tenant) {
    tenant = TenantCollection.findOne({ name: key });
    if (!tenant) {
      tenant = {
        name: key,
        key: TenantCollection.find({}).count()
      }

      // TODO
      // this should be blocking for no overlap on a cluster
      TenantCollection.insert(tenant);
    }

    tenantList[key] = tenant;
  }

  if (!driverPool[key].connected) {
    driverPool[key].driver = new MongoInternals.RemoteCollectionDriver(driverPool[key].connectionString, connectionOptions);
    driverPool[key].connected = true;
  }

  let collection = context._tenants[key];
  if (!collection) {
    // make sure we don't exceed the mongodb collection character size
    collection = new Mongo.Collection(`${context._name}_${tenant.key}`.substr(0, 123), {
      _driver: driverPool[key].driver
    });

    context._tenants[key] = collection;
    driverPool[key].collections.push(collection);
  }

  // update the driver pool last accessed date
  // we use for cleanup of driver pool access
  driverPool[key].lastAccessed = Date.now();

  return collection;
}

// TODO
// disconnect from connections
