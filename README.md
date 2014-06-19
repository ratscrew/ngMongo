ngMongo
=======

An angular and node module for connecting to mongo.

ngMongo gives developers an easy way bind $scope variables to mongodb queries.

check out the documentadion [here](https://github.com/ratscrew/ngMongo/wiki)

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

"boundArray" will now update every time some one saves a document in "mycollection" with a "created" field that equals "me"
***
