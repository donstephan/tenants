import TenantCollection from './collection';

const collections = {};

Mongo.Collection.prototype.from = function(db) {
  const context = this;

  let collection = collections[db];
  let key = TenantCollection.findOne({ name: db });
  if (!collection && key) {
    collection = new Mongo.Collection(`${context._name}_${key.key}`);
    collections[db] = collection;
  }

  return collection || context;
}