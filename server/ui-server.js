// Routes for the UI server. Suitable for dynamic content that should not be
// cached aggressively.
var fs = require('fs'),
    path = require('path'),
    express = require('express'),
    mirror = require('mirror'),
    Bones = require('bones'),
    controllers = require('../mvc/controllers'),
    models = require('../mvc/models');

module.exports = function(server, settings) {
    server.enable('jsonp callback');
    server.error(Error.HTTP.handler(settings));

    // Initialize bones, bones templates, server-side mixins.
    Bones.Bones(server);
    Bones.settings = settings;
    require('../mvc/models-server')(settings);

    // Add templates to the Bones template cache.
    var templatePath = path.join(__dirname, '..', 'templates'),
        templateFiles = fs.readdirSync(templatePath);
    for (var i = 0; i < templateFiles.length; i++) {
        var key = path.basename(templateFiles[i], '.hbs');
        Bones.templates[key] = fs.readFileSync(
            path.join(templatePath, templateFiles[i]),
            'utf-8'
        );
    }

    // Set up the backbone router
    new controllers.Router();

    // Static assets, mirrored module assets, and options mirrored to client.
    server.use(express.staticProvider(path.join(__dirname, '..', 'client')));
    server.get('/vendor.js', mirror.assets([
        'tilestream/client/js/jquery.js',
        'underscore/underscore.js',
        'backbone/backbone.js',
        'handlebars/handlebars.js',
        'bones/bones.js',
        'openlayers_slim/OpenLayers.js',
        'wax/control/lib/gridutil.js',
        'wax/build/wax.ol.min.js',
        'wax/lib/record.js',
        'tilestream/mvc/models.js',
        'tilestream/mvc/views.js',
        'tilestream/mvc/controllers.js',
        'tilestream/client/js/app.js'
    ]));
    server.get('/theme/default/style.css', mirror.file('openlayers_slim/theme/default/style.css'));

    // Settings endpoint. Filter  settings down to only those that should be
    // accessible by the client.
    server.get('/settings.js', function(req, res, next) {
        var pub = ['uiHost', 'tileHost', 'uiPort', 'tilePort', 'features'],
            filtered = {};
        _(settings).each(function(val, key) {
            _(pub).include(key) && (filtered[key] = val);
        });
        filtered.uiHost = filtered.uiHost
            ? filtered.uiHost
            : 'http://' + req.headers.host + '/';
        filtered.tileHost = filtered.tileHost.length
            ? filtered.tileHost
            : ['http://' + req.headers.host + '/'];
        res.send(
            'var Bones = Bones || {};\n' +
            'Bones.settings = ' + JSON.stringify(filtered) + ';',
            { 'Content-Type': 'text/javascript' }
        );
    });

    // Add map wax endpoint.
    require('./wax')(server, settings);

    // Route middleware for validating a model.
    function validateModel(req, res, next) {
        if (models[req.param('model')]) {
            next();
        } else {
            next(new Error.HTTP('Invalid model.', 400));
        }
    };

    // Route middleware for validating a collection.
    function validateCollection(req, res, next) {
        if (models[req.param('model') + 'List'] || models[req.param('model') + 's']) {
            next();
        } else {
            next(new Error.HTTP('Invalid collection.', 400));
        }
    };

    // Generic GET endpoint for collection loading.
    server.get('/api/:model', validateCollection, function(req, res, next) {
        var Collection = models[req.param('model') + 'List'] || models[req.param('model') + 's'];
        var list = new Collection([], { id: req.params[0] });
        list.fetch({
            success: function(model, resp) { res.send(model.toJSON()) },
            error: function(model, err) { next(err); }
        });
    });

    // REST endpoints for models.
    server.all('/api/:model/*', validateModel, function(req, res, next) {
        var model = new models[req.param('model')]({ id: req.params[0] });
        switch (req.method) {
        case 'GET':
            model.fetch({
                success: function(model, resp) { res.send(model.toJSON()) },
                error: function(model, err) { next(err); }
            });
            break;
        case 'POST':
        case 'PUT':
            model.save(req.body, {
                success: function(model, resp) { res.send(resp) },
                error: function(model, err) { next(err); }
            });
            break;
        case 'DELETE':
            model.destroy({
                success: function(model, resp) { res.send({}) },
                error: function(model, err) { next(err); }
            });
            break;
        }
    });
}

