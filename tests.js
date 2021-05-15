// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

if (Meteor.isServer) {
  const { Tenants } = require("./server");
 
  Tenants.set({
    "tenant_1": "mongodb://127.0.0.1:3001/tenant_1",
    "tenant_2": "mongodb://127.0.0.1:3001/tenant_2",
  });
}

// TODO
// copied from mongo collection tests

Tinytest.add('collection - call find with sort function',
  function (test) {
    var initialize = function (collection) {
      collection.insert({a: 2});
      collection.insert({a: 3});
      collection.insert({a: 1});
    };

    var sorter = function (a, b) {
      return a.a - b.a;
    };

    var getSorted = function (collection) {
      return collection.find({}, {sort: sorter}).map(function (doc) { return doc.a; });
    };

    var collectionName = 'sort' + test.id;
    var namedCollection = new Mongo.Collection(collectionName, {connection: null});

    initialize(namedCollection);
    test.equal(getSorted(namedCollection), [1, 2, 3]);
  }
);

Tinytest.add('collection - call native find with sort function',
  function (test) {
    var collectionName = 'sortNative' + test.id;
    var nativeCollection = new Mongo.Collection(collectionName);

    if (Meteor.isServer) {
      test.throws(
        function () {
          nativeCollection
            .find({}, {
              sort: function () {},
            })
            .map(function (doc) {
              return doc.a;
            });
        },
        /Illegal sort clause/
      );
    }
  }
);

Tinytest.add('collection - calling native find with maxTimeMs should timeout',
  function(test) {
    var collectionName = 'findOptions1' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    function doTest() {
      return collection.find({$where: "sleep(100) || true"}, {maxTimeMs: 50}).count();
    }
    if (Meteor.isServer) {
      test.throws(doTest);
    }
  }
);


Tinytest.add('collection - calling native find with $reverse hint should reverse on server',
  function(test) {
    var collectionName = 'findOptions2' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});
    collection.insert({a: 2});

    function m(doc) { return doc.a; }
    var fwd = collection.find({}, {hint: {$natural: 1}}).map(m);
    var rev = collection.find({}, {hint: {$natural: -1}}).map(m);
    if (Meteor.isServer) {
      test.equal(fwd, rev.reverse());
    } else {
      // NOTE: should be documented that hints don't work on client
      test.equal(fwd, rev);
    }
  }
);

Tinytest.addAsync('collection - calling native find with good hint and maxTimeMs should succeed',
  function(test, done) {
    var collectionName = 'findOptions3' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    Promise.resolve(
      Meteor.isServer &&
        collection.rawCollection().createIndex({ a: 1 })
    ).then(() => {
      test.equal(collection.find({}, {
        hint: {a: 1},
        maxTimeMs: 1000
      }).count(), 1);
      done();
    }).catch(error => test.fail(error.message));
  }
);

Tinytest.add('collection - calling find with a valid readPreference',
  function(test) {
    if (Meteor.isServer) {
      const defaultReadPreference = 'primary';
      const customReadPreference = 'secondaryPreferred';
      const collection = new Mongo.Collection('readPreferenceTest1');
      const defaultCursor = collection.find();
      const customCursor = collection.find(
        {},
        { readPreference: customReadPreference }
      );

      // Trigger the creation of _synchronousCursor
      defaultCursor.count();
      customCursor.count();

      test.equal(
        defaultCursor._synchronousCursor._dbCursor.operation.readPreference
          .mode,
        defaultReadPreference
      );
      test.equal(
        customCursor._synchronousCursor._dbCursor.operation.readPreference.mode,
        customReadPreference
      );
    }
  }
);

Tinytest.add('collection - calling find with an invalid readPreference',
  function(test) {
    if (Meteor.isServer) {
      const invalidReadPreference = 'INVALID';
      const collection = new Mongo.Collection('readPreferenceTest2');
      const cursor = collection.find(
        {},
        { readPreference: invalidReadPreference }
      );

      test.throws(function() {
        // Trigger the creation of _synchronousCursor
        cursor.count();
      }, `Invalid read preference mode ${invalidReadPreference}`);
    }
  }
);
