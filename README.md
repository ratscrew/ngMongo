ngMongo
=======

An angular and node module for connecting to mongo.

ngMongo gives developers an easy way bind $scope variables to mongodb queries.

check out the documentadion [here](https://github.com/ratscrew/ngMongo/wiki)

check out How it all works [here](https://github.com/ratscrew/ngMongo/wiki/how-it-all-works)
***

## Node.js Module
###simple setup:

    var express = require('express')
    , app = express()
    , http = require('http')
    , server = http.createServer(app)
    , io = require('socket.io').listen(server)
    , ngMongo = require('ngmongo')(io,app);

    var db = ngMongo.db('mydb');
    server.listen(80);


###key features

* validation
 * before documents are updated
 * after docuemts are updated
 * before fields are updated
 * after fields are updated
* security
 * roles based
 * user based
* public functions
 * security
 * angular promises

[Server Side Doc](https://github.com/ratscrew/ngMongo/wiki/Server-Side)
***

## Angular Module

###simple setup:

link scripts:

     <script src="/socket.io/socket.io.js"></script>
     <script src="ngMongo.js"></script>


config Angular:
   
    var myApp = angular.module('myApp', ['ngMongo']);

bind to query:


    myApp.controller('testController', function ($scope, $mongo) {
       $scope.boundArray = $mongo.query('mycollection').$find({ created: 'me' }).$toArray();
       $scope.saveItem = function(item){
          item.$save();
       };
    });

"boundArray" will now update every time someone saves or updates a document in "mycollection" with a "created" field that equals "me"

###key features

* realtime auto syncing query
* extendable documents object 
* closely mirrored mongo functions
* undo unsaved changes
* ...

[Client Side Doc](https://github.com/ratscrew/ngMongo/wiki/Client-Side)
***
