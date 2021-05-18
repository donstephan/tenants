// Write your package code here
import { Mongo } from 'meteor/mongo';

import TenantCollection from './collection';

let logger = () => {};
if (process.env.TENANTS_LOGGER) {
  logger = (message) => {
    console.log(message);
  }
}

export const Tenants = {
  TENANTS_POOL_DISCONNECT_TIME: process.env.TENANTS_POOL_DISCONNECT_TIME || 1000 * 30,
  TENANTS_CLEANUP_INTERVAL: process.env.TENANTS_CLEANUP_INTERVAL || 1000 * 30,
  collection: TenantCollection,
  _driverPool: {},
  _tenantList: [],
  _connectionOptions: null,
  set: (tenants, disableAutoPublish, remoteConnectionOptions) => {
    check(tenants, Object);
    
    Object.keys(tenants).forEach((key) => {
      if (!Tenants._driverPool[key]) {
        Tenants._driverPool[key] = {
          driver: null,
          lastAccessed: Date.now(),
          connected: false,
          connectionString: tenants[key],
          collections: [],
          collectionNames: []
        };
      }
    });

    if (remoteConnectionOptions) {
      check(remoteConnectionOptions, Object);
      Tenants._connectionOptions = remoteConnectionOptions;
    }

    if (!disableAutoPublish) {
      Meteor.publish(null, () => {
        return TenantCollection.find({})
      });
    }
  },
  get: () => {
    return ["", ...Object.keys(Tenants._driverPool)];
  },
  _initialConnectionFuncs: {},
}

Mongo.Collection.prototype.onFirstConnection = function (cb) {
  const context = this;

  if (!Tenants._initialConnectionFuncs[context._name]) {
    Tenants._initialConnectionFuncs[context._name] = [];
  }

  Tenants._initialConnectionFuncs[context._name].push(cb);
}

Mongo.Collection.prototype.from = function (key) {
  const context = this;
  if (!key) {
    return context;
  }

  if (!context._tenants) {
    context._tenants = {};
  }

  let tenant = Tenants._tenantList[key];
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

    Tenants._tenantList[key] = tenant;
  }

  if (!Tenants._driverPool[key].driver) {
    logger(`connecting to ${key}`);
    Tenants._driverPool[key].driver = new MongoInternals.RemoteCollectionDriver(Tenants._driverPool[key].connectionString, Tenants._connectionOptions);
  }

  if (!Tenants._driverPool[key].driver.mongo.client.topology.isConnected()) {
    logger(`reconnecting to ${key}`);
    Promise.await(Tenants._driverPool[key].driver.mongo.client.topology.connect());
  }

  let collection = context._tenants[key];
  if (!collection) {

    // make sure we don't exceed the mongodb collection character size
    collection = new Mongo.Collection(`${context._name}_${tenant.key}`.substr(0, 123), {
      _driver: Tenants._driverPool[key].driver
    });

    context._tenants[key] = collection;
    Tenants._driverPool[key].collections.push(collection);
    Tenants._driverPool[key].collectionNames.push(collection._name);

    collection._tenant = key;
  }

  if (!context._didProcessInitialConnection) {
    context._didProcessInitialConnection = true;

    if (Tenants._initialConnectionFuncs[context._name]?.length > 0) {
      Tenants._initialConnectionFuncs[context._name].forEach((func) => {
        Promise.await(func(collection, key));
      });
    }
  }

  // update the driver pool last accessed date
  // we use for cleanup of driver pool access
  Tenants._driverPool[key].lastAccessed = Date.now();

  return collection;
}

// TODO
// ability to immediately close a connection
// Mongo.Collection.prototype.close = function () {
//   const context = this;
//   context.rawCollection().s.topology.close()
// }

const connectionHandler = () => {
  Object.keys(Tenants._driverPool).forEach((key) => {
    if (Tenants._driverPool[key].driver) {
      const isConnected = Tenants._driverPool[key].driver.mongo.client.topology.isConnected();
      const lastAccessed = Date.now() - Tenants._driverPool[key].lastAccessed;
      if (isConnected && lastAccessed > Tenants.TENANTS_POOL_DISCONNECT_TIME) {
        let hasActiveCursor = false;
        this.Meteor.server.sessions.forEach((session) => {
          for (const collection of session.collectionViews.keys()) {
            if (Tenants._driverPool[key].collectionNames.includes(collection)) {
              hasActiveCursor = true;
            }
          }
        });

        if (hasActiveCursor) {
          Tenants._driverPool[key].lastAccessed = Date.now();
        } else {
          logger(`disconnecting from ${key}`);
          Tenants._driverPool[key].driver.mongo.client.topology.close()
        }
      }
    }
  });

  // run every 10 seconds to cleanout unused connections
  Meteor.setTimeout(connectionHandler, Tenants.TENANTS_CLEANUP_INTERVAL);
}

connectionHandler();
