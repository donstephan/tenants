Package.describe({
  name: 'donstephan:tenants',
  version: '0.0.1',
  summary: 'Mongo multi-tenancy for Meteor Apps.',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('2.2');
  api.use('ecmascript');
  api.use('mongo');
  api.mainModule('server.js', 'server');
  api.mainModule('client.js', 'client');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('mongo');
  api.use("donstephan:tenants");
  api.addFiles("server.js", "server");
  api.addFiles("client.js", "client");
  api.mainModule("tests.js")
});
