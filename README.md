ngMongo
=======

An angular and node module for connecting to mongo.

ngMongo gives developers an easy way bind $scope variables to mongodb queries.

Check out the documentadion [here](https://github.com/ratscrew/ngMongo/wiki)

Check out how it all works [here](https://github.com/ratscrew/ngMongo/wiki/how-it-all-works)
***

## Node.js Module
###Simple setup:

    var express = require('express')
    , app = express()
    , http = require('http')
    , server = http.createServer(app)
    , io = require('socket.io').listen(server)
    , ngMongo = require('ngmongo')(io,app);

    var db = ngMongo.db('mydb');
    server.listen(80);


###Key features

* Validation
 * Before documents are updated
 * After docuemts are updated
 * Before fields are updated
 * After fields are updated
* Security
 * Roles based
 * User based
* Public functions
 * Security
 * Angular promises

[Server Side Doc](https://github.com/ratscrew/ngMongo/wiki/Server-Side)
***

## Angular Module

###Simple setup:

link scripts:

     <script src="/socket.io/socket.io.js"></script>
     <script src="ngMongo.js"></script>


config angular:
   
    var myApp = angular.module('myApp', ['ngMongo']);

bind to query:


    myApp.controller('testController', function ($scope, $mongo) {
       $scope.boundArray = $mongo.query('mycollection').$find({ created: 'me' }).$toArray();
       $scope.saveItem = function(item){
          item.$save();
       };
    });

"boundArray" will now update every time someone saves or updates a document in "mycollection" with a "created" field that equals "me"

###Key features

* Realtime auto syncing query
* Extendable documents object 
* Closely mirrored mongo functions
* Undo unsaved changes
* ...

[Client Side Doc](https://github.com/ratscrew/ngMongo/wiki/Client-Side)
***
