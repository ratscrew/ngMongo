var ngMongoModule = angular.module('ngMongo', []);

// gives access to sockets.io and routting of returned responces/updates 
// should be configuered to set url for the 
ngMongoModule.provider('$SocketsIo', [function () {
    var me = {connected:false, url : 'http://localhost'};
    var defer;
    me.$q = {};

    this.url = function(newUrl){                                                              //set the socket.io client script url
        if(newUrl) me.url = newUrl;
        return me.url ;
    };

    me.qList = {};   //the obj for linking responces to requests

    me.rIdGen = function () { return Math.random().toString() + Math.random().toString(); };  // Quick guid thats not a real guid, they take too long to create
    
    me.isFunction = function (functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    }



    var routing = function(){

        me.socket.on('publicFunctionReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].publicFunctionReturn) {
                me.qList[data.dataSend.requestId].publicFunctionReturn(data.err, data.dataReturned, data.dataSent);
            }
        });
        me.socket.on('findReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findReturn) {
                me.qList[data.dataSend.requestId].findReturn(data.err, data.docs, data.dataSend);
            }
        });
        me.socket.on('findUpdate', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findUpdate) {
                me.qList[data.dataSend.requestId].findUpdate(data.err, data.docs, data.dataSend);
            }
        });
        me.socket.on('pReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].pReturn) {
                me.qList[data.dataSend.requestId].pReturn(data.err, data.data, data.dataSend);
            }
        });
        me.socket.on('findMoreReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findMoreReturn) {
                me.qList[data.dataSend.requestId].findMoreReturn(data.err, data.docs, data.dataSend);
            }
        });
        me.socket.on('progressReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].progressReturn) {
                me.qList[data.dataSend.requestId].progressReturn(data.progress, data.dataSent);
            }
        });
        me.socket.on('countReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].countReturn) {
                me.qList[data.dataSend.requestId].countReturn(data.count, data.dataSent);
            }
        });
        me.socket.on('totalsReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].totalsReturn) {
                me.qList[data.dataSend.requestId].totalsReturn(data.totals,data.dataSent);
            }
        });
        me.socket.on('saveReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].saveReturn) {
                me.qList[data.dataSend.requestId].saveReturn(data.savedDoc, data.dataSent);
            }
        });
        me.socket.on('deleteReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].deleteReturn) {
                me.qList[data.dataSend.requestId].deleteReturn(data.dataSent);
            }
        });

        if(defer && defer.resolve) defer.resolve();
    };



    me.connect = function () {                                                                // called once if needed, handels respnce routing, may move to on('connect')
        

        if (me.connected == true) {

            return defer.promise;
        }
        
        defer = me.$q.defer();
        me.socket = io.connect(me.url);
        me.connected = true;
        me.socket.on('connect',routing);
        me.socket.on('reconnect',routing);

        return defer.promise;
    }

    this.$get = function ($q) {
            me.$q = $q;
        return me;
    }
    
}]);

// gives mongo like syntax to subscribe to mongo queries
ngMongoModule.service('$mongo', ['$SocketsIo', '$timeout', '$server', '$q', function ($SocketsIo, $timeout, $server, $q) {
    this.query = function (collection) {
        if ($SocketsIo.connected == false) $SocketsIo.connect();                                                          // connect via io if not
        var arrayResutls = [],          // main object returned by everything                               
        count = 0,                      // expected length 
        find,                           // the where statment
        progress = 1,                   // 0-1 % conplete **only works for simple queries**
        hasBeenCalled = false,          // is this query active, has toArray been called
        totalsSkipLimits = true,        // if using the totals grouping should they be for just the results returned or if the skip & limit are removed
        totalsObj = {},                 // returned totals obj
        totals,                         // a $group satment for the totals
        totalsCalculatingDefault = 'Calculating...', // what to show before the totals are returned
        projection,                     // $project satment
        limit ,                         // $limit #
        sort ,                          // $sort satment
        group ,                         // $group satment
        aggregate ,                     // $aggregate [satments]
        progressCallBack,               // function on an progress  **only works for simple queries**
        progressInc = .25,              // how offten do you get an update **only works for simple queries**
        localVars = {},                 // a dictionary of 
        newAtEnd = false,               // can be false or a new doc obj
        rid = $SocketsIo.rIdGen(),      // give this query a "guid"
        newDoc = doc,                   // the template doc applied to each item in the returned array
        afterUpdate,                    // a functions called after each update
        then,                           // a functions called after first return
        db,                             // default or first db by default but can be changed
        fullItemKey,                    // for aggregate/group making subItems saveable
        newAtStart,                     // same as new at end but at start
        defer,                          // prommise
        number = 0,
        pNumber = 0,
        indexOf = {};


        // removes all routing back to this query
        function clearQList() { if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; }; };

        // makes the query request back to the server
        arrayResutls.$toArray = function (toArrayCallBack) {
            if(toArrayCallBack) afterUpdate = toArrayCallBack;
            arrayResutls.$cancel();                                          // stops updates for an old query for this obj if there is any
            rid = $SocketsIo.rIdGen();
            progress = 0;                                                    // build request
            var data = { collection: collection, requestId: rid, find: find, progress: progressInc, newAtEnd: newAtEnd, newAtStart: newAtStart, length:1000, more: false, totalsSkipLimits: totalsSkipLimits }
            if(limit) {
                data.limit = limit;
                data.length = arrayResutls.length + limit;
            }
            if(sort) data.sort = sort;
            if(aggregate) data.aggregate = aggregate;
            if(group) data.group = group;
            if(totals) data.totals = totals;
            if(projection) data.projection = projection;
            if(db) data.db = db;
            data.number = number;
            hasBeenCalled = true;
            $SocketsIo.socket.emit('find', data);                          // make request
             
            $SocketsIo.qList[rid] = {                                      // setup routing
                findReturn: function (err, docs, sentData) {
                    if(!err && number <= sentData.number){
                        number = sentData.number || 0;
                        pNumber = sentData.pNumber || 0;
                        $timeout(function () {
                            progress = 1;
                            arrayResutls.$clear();

                            for (var i = 0; i < docs.length; i++) {
                                var docId = "";
                                if(docs[i]._id) docId = docs[i]._id.toString();
                                if(indexOf[docId]) arrayResutls.splice(indexOf[docId], 1);                                
                                if (!localVars[docId]) localVars[docId] = {};
                                if ((group || aggregate) && fullItemKey){
                                    if (!localVars[docId][fullItemKey]) localVars[docId][fullItemKey] = {};
                                    for(var j in docs[i][fullItemKey]){
                                        if(!localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()]) localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()] = {};
                                        docs[i][fullItemKey][j] = newDoc(docs[i][fullItemKey][j], collection, localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()], arrayResutls)
                                    }
                                    arrayResutls.push(docs[i]);
                                    indexOf[docId] = (arrayResutls.length - 1);
                                } 
                                else {
                                    if(indexOf[docs[i]._id.toString()]) arrayResutls.splice(indexOf[docs[i]._id.toString()], 1);
                                    arrayResutls.push(newDoc(docs[i], collection, localVars[docId],arrayResutls));
                                    indexOf[docs[i]._id.toString()] = (arrayResutls.length - 1);
                                }
                            }
                            if(then != null) then();
                            then = null;
                            if(afterUpdate != null) afterUpdate();
                            if(defer) defer.resolve(arrayResutls);
                            $timeout(function(){
                                scanObj(arrayResutls);
                            },1);
                        });
                    }
                    else{
                        console.log(err);
                    }
                    
                }, countReturn: function (countQ) {
                    $timeout(function () {
                        count = countQ;
                    });
                },
                progressReturn: function (progressQ, sentData) {
                    $timeout(function () {
                        if (progress < 1) {
                            progress = progressQ;
                            if ($SocketsIo.isFunction(progressCallBack)) {
                                progressCallBack(progress);
                            }
                        }
                    });
                },
                findUpdate: function (err, docs, sentData) {
                    if(!err && number <= sentData.number){
                        number = sentData.number || 0;
                        pNumber = sentData.pNumber || 0;
                         $timeout(function () {
                            progress = 1;
                            arrayResutls.$clear();
                                for (var i = 0; i < docs.length; i++) {
                                    var docId = "";
                                    if(docs[i]._id) docId = docs[i]._id.toString();
                                    if(indexOf[docId]) arrayResutls.splice(indexOf[docId], 1);                                
                                    if (!localVars[docId]) localVars[docId] = {};
                                    if ((group || aggregate) && fullItemKey){
                                        if (!localVars[docId][fullItemKey]) localVars[docId][fullItemKey] = {};
                                        for(var j in docs[i][fullItemKey]){
                                            if(!localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()]) localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()] = {};
                                            docs[i][fullItemKey][j] = newDoc(docs[i][fullItemKey][j], collection, localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()],arrayResutls)
                                        }
                                        arrayResutls.push(docs[i]);
                                        indexOf[docId] = (arrayResutls.length - 1);
                                    } 
                                    else {
                                        if(indexOf[docs[i]._id.toString()]) arrayResutls.splice(indexOf[docs[i]._id.toString()], 1);
                                        arrayResutls.push(newDoc(docs[i], collection, localVars[docId],arrayResutls));
                                        indexOf[docs[i]._id.toString()] = (arrayResutls.length - 1);
                                    }
                                }
                            if(afterUpdate != null) afterUpdate();
                            $timeout(function(){
                                scanObj(arrayResutls);
                            },1);
                        });   
                    }
                    
                },
                totalsReturn:function(totals,sentData){
                    $timeout(function(){
                        totalsObj.results = totals;    
                    });    
                },
                pReturn: function (err,data, sentData) {
                    if(!err && number <= sentData.number && pNumber <= sentData.pNumber){
                        number = sentData.number || 0;
                        pNumber = sentData.pNumber || 0;
                        $timeout(function () {
                            for (var i = 0; i < arrayResutls.length; i++) {
                                if(data.docId == arrayResutls[i]._id){
                                    if(data.update){
                                        for(var j in data.update.$unset){
                                            delete arrayResutls[i][j];
                                            delete arrayResutls[i].localVar.$oldDoc[j];
                                        }
                                        for(var j in data.update.$set){
                                            arrayResutls[i][j] = data.update.$set[j];
                                            arrayResutls[i].localVar.$oldDoc[j] = data.update.$set[j];
                                        }   
                                    }
                                    break;break;
                                    return true;
                                }
                            }
                        if(afterUpdate != null) afterUpdate();
                        $timeout(function(){
                            scanObj(arrayResutls);
                        },1);
                        });
                    }
                }
            };

            return arrayResutls;
        };

        arrayResutls.$db = function (dbQ) {
                db = dbQ;
                arrayResutls.db = db;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$find = function (findQ) {
            find = findQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$aggregate = function (aggregateQ,fullItemKeyQ) {
            aggregate = aggregateQ;
            if(fullItemKeyQ) fullItemKey = fullItemKeyQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$group = function (groupQ,fullItemKeyQ) {
            group = groupQ;
            if(fullItemKeyQ) fullItemKey = fullItemKeyQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$projection = function (projectionQ) {
            projection = projectionQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$totalsCalculatingDefault = function (totalsCalculatingDefaultQ) {
            totalsCalculatingDefault = totalsCalculatingDefaultQ;
            if(totalsObj.results) totalsObj.results = {};
            if(!hasBeenCalled){
                for(var i in totals){
                    totalsObj.results[i] = totalsCalculatingDefault;
                } 
            }
            return totalsObj;
        };

        arrayResutls.$totals = function (totalsQ) {
            totals = totalsQ;
            if(!totalsObj.results) totalsObj.results = {};
            if(isEmpty(totalsObj.results)){
                for(var i in totals){
                    totalsObj.results[i] = totalsCalculatingDefault; //'Calculating...';
                }
            }
            if(hasBeenCalled) this.$toArray();
            return totalsObj;
        };

        arrayResutls.$totalsSkipLimits = function (totalsSkipLimitsQ) {
            totalsSkipLimits = totalsSkipLimitsQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$doc = function (docQ) {
            newDoc = docQ;
            return this;
        };

        arrayResutls.$deleteDoc = function (docQ, callBack) {
            $SocketsIo.socket.emit('deleteDoc', { collection: collection, requestId: rid, docId: docQ._id });
            return this;
        };

        arrayResutls.$cancel = function () {
            clearQList();
            $SocketsIo.socket.emit('cancel', { collection: collection, requestId: rid });
            rid = $SocketsIo.rIdGen();
        };
        arrayResutls._rid = function () { return rid;}
        arrayResutls.$clear = function () { arrayResutls.splice(0, arrayResutls.length); indexOf = {}; return this; };

        arrayResutls.$count = function () { return count; };

        arrayResutls.$saveAll = function (updateMe) {
            for (var i in arrayResutls) {
                if (arrayResutls[i] && arrayResutls[i].$save) arrayResutls[i].$save(updateMe);
            }
            return arrayResutls;
        };

        arrayResutls.$afterUpdate = function (afterUpdateQ) {
            afterUpdate = afterUpdateQ;
            if(arrayResutls.length > 0 || hasBeenCalled) afterUpdate();
            return arrayResutls;
        };

        arrayResutls.$then = function (thenQ) {
            then = thenQ;
            if(arrayResutls.length > 0 || hasBeenCalled) then();
            return arrayResutls;
        };

        arrayResutls.$progress = function (progressIncQ, callBack) {
            if (progressIncQ) {
                progressInc = progressIncQ;
                if (callBack) progressCallBack = callBack;
                return this;
            }
            return progress;
        }

        arrayResutls.$inProgress = function () { return progress < 1; }

        arrayResutls.$limit = function (limitQ) {
            if (limitQ) {
                limit = limitQ;
                if(hasBeenCalled) this.$toArray();
                return this;
            }
            return limit;
        }

        arrayResutls.$sort = function (sortQ) {
            if (sortQ) {
                sort = sortQ;
                if(hasBeenCalled) this.$toArray();
                return this;
            }
            return limit;
        }

        function checkDate (obj, key){
            if(obj[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i)) obj[key] = new Date(obj[key]);
        }

        function scanObj(obj){
            for(var i in obj){
                if((angular.isArray(obj[i]) || angular.isObject(obj[i])) && !angular.isDate(obj[i])) scanObj(obj[i]);
                else if(angular.isString(obj[i])) checkDate(obj, i);
            }
        }

        arrayResutls.$more = function (moreQ) {
            if(progress < 1){
                return this;
            }
            if(moreQ) limit = moreQ;
            progress = 0;

            var data = { collection: collection, requestId: rid, find: find, progress: progressInc, newAtEnd: newAtEnd, length:1000, more: true, totalsSkipLimits: totalsSkipLimits }
            if(newAtEnd){ data.skip = (arrayResutls.length -1);}
            else{data.skip = arrayResutls.length;}
            if(limit) {
                data.limit = limit;
                data.length = arrayResutls.length + limit;
            }
            if(sort) data.sort = sort;
            if(aggregate) data.aggregate = aggregate;
            if(group) data.group = group;
            if(totals) data.totals = totals;
            if(projection) data.projection = projection;
            if(db) data.db = db;
            data.number = number;
            $SocketsIo.socket.emit('find', data);
            if(!$SocketsIo.qList[rid]) return arrayResutls;
            $SocketsIo.qList[rid].findMoreReturn = function (err, docs, sentData) {
                    if(!err && number <= sentData.number){
                        number = sentData.number || 0;
                        pNumber = sentData.pNumber || 0;
                        $timeout(function () {
                            progress = 1;
                            for (var i = 0; i < arrayResutls.length; i++) {
                                if(arrayResutls[i]._id) indexOf[arrayResutls[i]._id.toString()] = arrayResutls.indexOf(arrayResutls[i]);
                            }
                            for (var i = 0; i < docs.length; i++) {
                                var docId = "";
                                if(docs[i]._id) docId = docs[i]._id.toString();
                                if(indexOf[docId]) arrayResutls.splice(indexOf[docId], 1);                                
                                if (!localVars[docId]) localVars[docId] = {};
                                if ((group || aggregate) && fullItemKey){
                                    if (!localVars[docId][fullItemKey]) localVars[docId][fullItemKey] = {};
                                    for(var j in docs[i][fullItemKey]){
                                        if(!localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()]) localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()] = {};
                                        docs[i][fullItemKey][j] = newDoc(docs[i][fullItemKey][j], collection, localVars[docId][fullItemKey][docs[i][fullItemKey][j]._id.toString()], arrayResutls)
                                    }
                                    arrayResutls.push(docs[i]);
                                    indexOf[docId] = arrayResutls.indexOf(docs[i]);
                                } 
                                else {
                                    if(indexOf[docs[i]._id.toString()]) arrayResutls.splice(indexOf[docs[i]._id.toString()], 1);
                                    arrayResutls.push(newDoc(docs[i], collection, localVars[docId],arrayResutls));
                                    indexOf[docs[i]._id.toString()] = arrayResutls.indexOf(docs[i]);
                                }
                            }
                            if(afterUpdate != null) afterUpdate();
                            if(defer) defer.resolve(arrayResutls);
                            $timeout(function(){
                                scanObj(arrayResutls);
                            },1);
                        });
                    }
                };


            return this;
        };

        arrayResutls.$newAtEnd = function (newAtEndQ) {
            newAtEnd = newAtEndQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$newAtStart = function (newAtStartQ) {
            newAtStart = newAtStartQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$q = function () {
            defer = $q.defer();
            if(!(progress < 1)) {
                $timeout(function () {
                    defer.resolve(arrayResutls); 
                })
            }
            return defer.promise;
        };

        return arrayResutls;
    }

    this.doc = doc;                             //expose base doc

    // the base doc for every item
    // theDoc = item obj returned from server,
    // collection = collection name as string, 
    // localVar = an object with anything not saved back to the database, 
    // parentQuery = the parent array
    function doc(theDoc, collection, localVar, parentQuery) {
        var rid = $SocketsIo.rIdGen(), inProgress = false;

        theDoc.localVar = localVar;
        if (!theDoc.localVar) theDoc.localVar = {};

        theDoc.localVar.$oldDoc = strippedDoc();             // save origenal obj for comparisen latter

        // removes data not be saved back to the database
        function strippedDoc(docObj) {
            if (!docObj) docObj = theDoc;
            var doc = {}, dumDoc = {};
            for (var i in docObj) {
                if (['localVar'].indexOf(i) == -1 && i.indexOf('$') == -1) {
                    dumDoc[i] = docObj[i];
                }
            }
            angular.copy(dumDoc, doc);
            return doc;
        };

        theDoc.$strippedDoc = strippedDoc;

        function clearQList() { if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; }; };
        
        var sdefer;
        theDoc.$save = function (updateMe,timeout,max,p) {
            sdefer = $q.defer();
            if(timeout){
                if(!max) max = 3; 
                if(theDoc.localVar.saveTimer)  $timeout.cancel(theDoc.localVar.saveTimer);
                if(theDoc.localVar.saveInt ==  null) theDoc.localVar.saveInt = 0;
                theDoc.localVar.saveInt += 1;
                if(theDoc.localVar.saveInt > max){
                    theDoc.localVar.saveInt = 0;
                    save(updateMe);
                }
                else{
                    theDoc.localVar.saveTimer = $timeout(function(){
                        save(updateMe);
                        theDoc.localVar.saveInt = 0;
                    },timeout)  
                }
            }
            else{
                save(updateMe);
            }
            function save(updateMe){
                theDoc.$cancelSave();
                rid = $SocketsIo.rIdGen();
                inProgress = true;
                    var data = { collection: collection, requestId: rid, doc: deepMatch(strippedDoc(), strippedDoc(theDoc.localVar.$oldDoc)) };
                    if (parentQuery && parentQuery.db) data.db = parentQuery.db;
                if (theDoc.$isNew == true) {
                    data.doc = deepMatch(strippedDoc(), { _id: theDoc._id });
                    data.$isNew = true;
                }

                if (data.doc.change && Object.keys(data.doc.change).length > 0) {
                    if (updateMe) data.updateMe = updateMe;
                    if (p) data.p = p;
                    if(parentQuery && parentQuery._rid()) data.partentRequestId = parentQuery._rid();
                    $SocketsIo.socket.emit('save', data);
                    theDoc.localVar.$oldDoc = strippedDoc();
                    $SocketsIo.qList[rid] = {
                        saveReturn: function (savedDoc) {
                            $timeout(function () {
                                inProgress = false;
                                sdefer.resolve();
                            });
                        }

                    }
                }

            }

            return sdefer.promise;;
        };

        theDoc.$delete = function (updateMe) {
            
            rid = $SocketsIo.rIdGen();
            inProgress = true;
            var data = { collection: collection, requestId: rid, docId:theDoc._id };
            if (updateMe) data.updateMe = updateMe;
            $SocketsIo.socket.emit('deleteDoc', data);
            $SocketsIo.qList[rid] = {
                saveReturn: function (savedDoc) {
                    $timeout(function () {
                        inProgress = false;
                    });
                }
            }
            
        };

        theDoc.$cancelSave = function () {
            $SocketsIo.socket.emit('cancelSave', {requestId:rid});
            clearQList();
            return this;
        };

        theDoc.$deepMatch = deepMatch;
        // compares two objects and returns a dictionaly for files with old new and save statment
        function deepMatch(odj1, odj2) {
            var returnObj = {
                _id: odj1._id,
                change: {},
                save: {}
            };
            for (var i in odj1) {
                if (odj2[i] == undefined) {
                    returnObj.change[i] = { 'new': odj1[i], type: 'create' };
                    if (!returnObj.save.$set) returnObj.save.$set = {};
                    returnObj.save.$set[i] = odj1[i];
                }
                else if (angular.equals(odj1[i], odj2[i]) == false) {
                    returnObj.change[i] = { old: odj2[i], 'new': odj1[i], type: 'update' };
                    if (!returnObj.save.$set) returnObj.save.$set = {};
                    returnObj.save.$set[i] = odj1[i];
                }
            }
            for (var i in odj2) {
                if (odj1[i] == undefined) {
                    returnObj.change[i] = { old: odj2[i], type: 'delete' };
                    if (!returnObj.save.$unset) returnObj.save.$unset = {};
                    returnObj.save.$unset[i] = "";
                }
            }

            return returnObj;
        }

        return theDoc;
    }

    function isEmpty(obj) {
        if (obj == null) return true;
        if (obj.length > 0)    return false;
        if (obj.length === 0)  return true;
        for (var key in obj) {
            if (hasOwnProperty.call(obj, key)) return false;
        }
        return true;
    }
}]);

// gives access to pubilc server functions via promisses
ngMongoModule.service('$server', ['$SocketsIo', '$timeout', '$q', function ($SocketsIo, $timeout, $q) {
    this.functions = function (functionName, data) {
        var defer = $q.defer();
        var rid = $SocketsIo.rIdGen();
        $SocketsIo.connect().then( function(){
            $SocketsIo.socket.emit('publicFunction', { functionName: functionName, requestId: rid, data:data });
        }) 
        $SocketsIo.qList[rid] = {
            publicFunctionReturn: function (err, data, sentData) {

                if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; };
                if(err) defer.reject(data);
                defer.resolve(data);

            }
        }
        return defer.promise;
    };
}]);


