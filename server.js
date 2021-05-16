// Write your package code here
import { Mongo } from 'meteor/mongo';

import TenantCollection from './collection';

let tenantList = {};
let driverPool = {};
let connectionMap = {};
let connectionOptions = null;

export const Tenants = {
  set: function(tenants, disableAutoPublish, remoteConnectionOptions) {
    check(tenants, Object);
    Object.keys(tenants).forEach((key) => {
      connectionMap[key] = tenants[key];
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
  get: function() {
    return Object.keys(connectionMap);
  },
  collection: TenantCollection
}

Mongo.Collection.prototype.from = function(key) {
  const context = this;
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

      TenantCollection.insert(tenant);
    }

    tenantList[key] = tenant;
  }

  let collection = context._tenants[key];
  if (!collection) {
    let driver = driverPool[key];
    if (!driver) {
      const connectionString = connectionMap[key];
      if (!connectionString) {
        throw new Meteor.Error(`We can't find the tenant for key ${key}. Maybe it hasn't been initialized?`)
      }

      driver = new MongoInternals.RemoteCollectionDriver(connectionString, connectionOptions);

      driverPool[key] = driver;
    }

    // make sure we don't exceed the mongodb collection character size
    collection = new Mongo.Collection(`${context._name}_${tenant.key}`.substr(0, 123), {
      _driver: driver
    });

    context._tenants[key] = collection;
  }
  
  return collection;
}

// Variables exported by this module can be imported by other packages and
// applications. See tenants-tests.js for an example of importing.
export const name = 'tenants';
