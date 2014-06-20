module.exports = function(io, app, dbName){
    
    var db, subscriptions, mongojs, publicObj = {security :{},validation:{},publicFunctions:{}, mongojs : require('mongojs')}, express = require('express');
    mongojs = publicObj.mongojs;

    app.use(express.static(__dirname + '/ngMongoClientScripts'));

    publicObj.db = function(dbName){ 
        if(dbName){
            if(dbName.bson){db = dbName;}
            else {db = publicObj.mongojs(dbName);}
            subscriptions = db.collection('subscriptions');
        }
        return db;
    };

    if(dbName) publicObj.db(dbName);

    publicObj.clearSubscriptions = function(dbName){ 
        subscriptions.remove({});
    };

    function isFunction(functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    }

    function isObject(val) {
        return (typeof val === 'object');
    }

    function isNumber(val) {
        return (typeof val === 'number');
    }

    function isArray(val) {
        return (Object.prototype.toString.call(val) === '[object Array]');
    }

    io.sockets.on('connection', function (socket) {

        socket.on('publicFunction', function (data) {
            var fx = data.functionName, hasSecurity = false;
            var callback = function (err, dataReturned) {
                socket.emit('publicFunctionReturn', { err: err, dataSend: data, dataReturned: dataReturned });
            };

            if(socket.handshake && socket.handshake.user){
                if (publicObj.security[fx] && publicObj.security[fx]['default'] != undefined) {
                    hasSecurity = true;
                    if (isFunction(security[fx]['default'])) {
                        if (publicObj.security[fx]['default'](socket.handshake.user)) {
                            publicObj.publicFunctions[fx](data, callback, socket.handshake.user);
                            return true;
                        };
                    }
                    else {
                        if (publicObj.security[fx]['default']) {
                            publicObj.publicFunctions[fx](data, callback, socket.handshake.user);
                            return true;
                        };
                    }
                }
                if (socket.handshake.user.roles) {
                    for (var i in socket.handshake.user.roles) {
                        if (publicObj.security[fx] && publicObj.security[fx][socket.handshake.user.roles[i]] != undefined && isFunction(publicObj.security[fx][socket.handshake.user.roles[i]])) {
                            if (publicObj.security[fx] && publicObj.security[fx][socket.handshake.user.roles[i]] != undefined) {
                                hasSecurity = true;
                                if (isFunction(publicObj.security[fx][socket.handshake.user.roles[i]])) {
                                    if (publicObj.security[fx][socket.handshake.user.roles[i]](socket.handshake.user)) {
                                        publicObj.publicFunctions[fx](data, callback, socket.handshake.user);
                                        return true;
                                    };
                                }
                            }
                            else if (publicObj.security[fx] && publicObj.security[fx][socket.handshake.user.roles[i]] != undefined) {
                                hasSecurity = true;
                                if (publicObj.security[fx][socket.handshake.user.roles[i]]) {
                                    publicObj.publicFunctions[fx](data, callback, socket.handshake.user);
                                    return true;
                                };
                            }
                        }
                    }
                }
            } else { hasSecurity = true; }

            if (hasSecurity == false) publicObj.publicFunctions[fx](data, callback, socket.handshake.user);
            return true;

        });
 
        socket.on('disconnect', function () {
            subscriptions.remove({ socket: socket.id });
        })

        socket.on('cancel', function (data) {
            subscriptions.remove({ requestId: data.requestId, collection: data.collection, socket: socket.id });
        });
    
        socket.on('find', function (data) {
            data.socket = socket.id;
            data.command = 'find';

            var cursor, totalsCursor, collection, f = {}, rolesFilter = [];
        
            if(socket.handshake && socket.handshake.user){
                                                                                                                //build security filters
                if (publicObj.security[data.collection] && publicObj.security[data.collection].read['default']) {
                    if (isFunction(publicObj.security[data.collection].read['default'])) {                                    //collection level filter
                        rolesFilter.push(publicObj.security[data.collection].read['default'](socket.handshake.user));
                    }
                    else {
                        rolesFilter.push(publicObj.security[data.collection].read['default']);
                    }
                }
                if (socket.handshake.user.roles) {
                    for (var i in socket.handshake.user.roles) {                                                    //user level filters
                        if (publicObj.security[data.collection] && publicObj.security[data.collection].read[socket.handshake.user.roles[i]] != undefined && isFunction(publicObj.security[data.collection].read[socket.handshake.user.roles[i]])) {
                            rolesFilter.push(publicObj.security[data.collection].read[socket.handshake.user.roles[i]](socket.handshake.user));
                        }
                        else if (publicObj.security[data.collection] && publicObj.security[data.collection].read[socket.handshake.user.roles[i]]) {
                            rolesFilter.push(publicObj.security[data.collection].read[socket.handshake.user.roles[i]]);
                        }
                    }
                }
            }

            if (!db[data.collection]) {
                collection = db.collection(data.collection);
            }
            if (data.find != undefined) {
                if (data.find._id) data.find[k] = mongojs.ObjectId(data.find._id);                          //convert _id to id object
                                                                                                            //combind secutiy filters and find
                if (rolesFilter.length > 0) {
                    f.$and = [data.find, { $or: rolesFilter }]
               
                }
                else {
                    f = data.find;
                }
            }
            else if (rolesFilter.length > 0) {
                    f = { $or: rolesFilter };
            }

            if(data.group || data.aggregate){                                                               //Aggregate building
                var pipelines = [];
                if(f != {} || data.projection || data.group) {
                    if(f) pipelines.push({$match : f});
                    if(data.group) pipelines.push({$group : data.group});
                    if(data.sort) pipelines.push({$sort : data.sort});
                    if(data.skip) pipelines.push({$skip : data.skip}); 
                    if(data.limit) pipelines.push({$limit : data.limit}); 
                    if(data.projection) pipelines.push({$project : data.projection});
                }
                if(data.aggregate != {}) {                                                                  //user specicified aggregation
                    if(isArray(data.aggregate)){
                        for(var i in data.aggregate){
                            pipelines.push(data.aggregate[i])
                        }
                    }
                    else {
                        pipelines.push(data.aggregate)
                    }
                };
                cursor = collection.aggregate(pipelines,sendDocs);
            
                if(data.totals) {                                                                           //Build Totals
                    var t = [];
                    for(var i in pipelines){
                        t.push(pipelines[i]);    
                    }
                    t.push({$group:data.totals});
                    socket.emit('totalsCalculating', { dataSend: data });
                    totalsCursor = collection.aggregate(t,sendTotals);
                }
            }
            else {
                if(data.projection) {
                    cursor = collection.find(f,data.projection);
                }
                else{
                     cursor = collection.find(f);
                }
            
                if (data.skip != undefined) { cursor.skip(data.skip); }
                if (data.sort != undefined) { cursor.sort(data.sort); }
                if (data.limit != undefined) { cursor.limit(data.limit); }
                cursor.toArray(sendDocs);

                if(data.totals && data.totals._id === undefined) data.totals._id = null; 
                if(data.totals) {
                    var t = [{$match:f}];
                    if(!data.totalsSkipLimits){
                        if (data.sort != undefined) t.push({$sort:data.sort}); 
                        if (data.skip != undefined) t.push({$skip:data.skip}); 
                        if (data.limit != undefined) t.push({$limit:data.limit}); 
                    }
                    t.push({$group:data.totals});
                    socket.emit('totalsCalculating', { dataSend: data });
                    totalsCursor = collection.aggregate(t,sendTotals);
                }
            }

            if (data.progress && cursor) {                                                                    //notify of progress
                var i = 0, last = 0;;
                cursor.on('data', function (chunck) {
                    i += 1;
                    if (count > 0 && (last + data.progress) <= (i / count)) {
                        last = (i / count)
                        socket.emit('progressReturn', { progress: last, dataSend: data });
                    }
                });
            }

            function sendDocs (err, docs) {                                           //get set
                if (data.newAtEnd && !data.more) {
                    var newObj = {}
                    if ((typeof data.newAtEnd == "object") && (data.newAtEnd !== null)) {   //add new obj at end
                        for (var i in data.newAtEnd) {
                            newObj[i] = data.newAtEnd[i];
                        }
                    }
                    newObj._id = mongojs.ObjectId();
                    newObj.$isNew = true;
                    docs.push(newObj);
                }

                if(!data.more){
                    socket.emit('findReturn', { err: err, docs: docs, dataSend: data });
                }
                else{
                    socket.emit('findMoreReturn', { err: err, docs: docs, dataSend: data });
                }                                                                               //return set
                data.docs = [];
                for (var i in docs) {                                                       //build list of docs
                    data.docs.push(docs[i]._id);
                }
                var efFieldsObj = efFields(f);
                data.efFields = [];
                for (var i in efFieldsObj) {                                                //build list of filtered fields
                    data.efFields.push(i);
                }
                var sData = data;
                if (sData.find) sData.find = JSON.stringify(sData.find);
                if (sData.group) sData.group = JSON.stringify(sData.group);
                if (sData.aggregate) sData.aggregate = JSON.stringify(sData.aggregate);
                if (sData.projection) sData.projection = JSON.stringify(sData.projection);
                if (sData.totals) sData.totals = JSON.stringify(sData.totals);

                var sd = {$set:sData}
                if(sData.more) {
                    sd.$push={docs:{$each:data.docs}};
                    delete sData.docs;
                }
                
                subscriptions.findAndModify({                                              //save query to subsciptions
                    query: { requestId: data.requestId, collection: data.collection, socket: socket.id },
                    update: sd,
                    new: true,
                    upsert: true
                }, function (err, doc, lastErrorObject) {
                    if (err) { console.log({ subscriptions: { err: err, sData: sData, find: sData.find} }); }
                
                });
            }

            if(cursor){
                var count = 0;
                if (data.count == null) {                                                               //return count
                    cursor.count(function (err, countReturn) {
                        count = countReturn;
                        socket.emit('countReturn', { count: countReturn, dataSend: data });
                    });
                }
            }
        
            function sendTotals(err, totals) {
                    socket.emit('totalsReturn', { totals: totals[0], dataSend: data });
            }

        });

        function sendFindUpdates(efSubscription,_id) {
            var cursor, collection, ss = io.sockets.[efSubscription.socket], totalsCursor, f = {};
            if (!db[efSubscription.collection]) {                                                           //get collection
                collection = db.collection(efSubscription.collection);
            }
            var rolesFilter = [];        
        
            if(ss.handshake && ss.handshake.user){
                                                                                   //build security filters
                if (publicObj.security[efSubscription.collection] && publicObj.security[efSubscription.collection].read['default']) {
                    if (isFunction(publicObj.security[efSubscription.collection].read['default'])) {                      //default security
                        rolesFilter.push(publicObj.security[efSubscription.collection].read['default'](ss.handshake.user));
                    }
                    else {
                        rolesFilter.push(publicObj.security[efSubscription.collection].read['default']);
                    }
                }
                if (ss.handshake.user.roles) {
                    for (var i in ss.handshake.user.roles) {                                                      //user level security
                        if (publicObj.security[efSubscription.collection] && publicObj.security[efSubscription.collection].read[ss.handshake.user.roles[i]] != undefined && isFunction(publicObj.security[efSubscription.collection].read[ss.handshake.user.roles[i]])) {
                            rolesFilter.push(publicObj.security[efSubscription.collection].read[ss.handshake.user.roles[i]](ss.handshake.user));
                        }
                        else if (publicObj.security[efSubscription.collection] && publicObj.security[efSubscription.collection].read[ss.handshake.user.roles[i]]) {
                            rolesFilter.push(publicObj.security[efSubscription.collection].read[ss.handshake.user.roles[i]]);
                        }
                    }
                }
            }

            if (efSubscription.find != undefined) {                                                         //add security filter to query
                efSubscription.find = JSON.parse(efSubscription.find);
                if (efSubscription.find._id) efSubscription.find[k] = mongojs.ObjectId(efSubscription.find._id);
                for (var k in efSubscription.find) {
                    if (efSubscription.find[k].regEx) {
                        efSubscription.find[k] = new RegExp(efSubscription.find[k].regEx, 'i');
                    }
                }
                if (rolesFilter.length > 0) {
                    f.$and = [efSubscription.find, { $or: rolesFilter }]
                }
                else {
                    f = efSubscription.find;
                }
            
            }
            else if (rolesFilter.length > 0)  {
                    f = { $or: rolesFilter };
            }

            if(efSubscription.group) efSubscription.group = JSON.parse(efSubscription.group);
            if(efSubscription.aggregate) efSubscription.aggregate = JSON.parse(efSubscription.aggregate);
            if(efSubscription.projection) efSubscription.projection = JSON.parse(efSubscription.projection);
            if(efSubscription.totals) efSubscription.totals = JSON.parse(efSubscription.totals);

            if(efSubscription.group || efSubscription.aggregate || efSubscription.projection){                                                               //Aggregate building
                var pipelines = [];
                if(f != {} || efSubscription.projection || efSubscription.group) {                                             //complex find
                    if(f) pipelines.push({$match : f});
                    if(efSubscription.group) pipelines.push({$group : efSubscription.group});
                    if(efSubscription.sort) pipelines.push({$sort : efSubscription.sort});
                    if(efSubscription.skip) pipelines.push({$skip : efSubscription.skip}); 
                    if(efSubscription.limit) pipelines.push({$limit : efSubscription.limit}); 
                    if(efSubscription.projection) pipelines.push({$project : efSubscription.projection});
                }
                if(efSubscription.aggregate != {}) {                                                                  //user specicified aggregation
                    if(isArray(efSubscription.aggregate)){
                        for(var i in efSubscription.aggregate){
                            pipelines.push(efSubscription.aggregate[i])
                        }
                    }
                    else {
                        pipelines.push(efSubscription.aggregate)
                    }
                };
                cursor = collection.aggregate(pipelines, sendData);
            
                if(efSubscription.totals) {                                                                           //Build Totals
                    var t = [];
                    for(var i in pipelines){
                        t.push(pipelines[i]);    
                    }
                    t.push({$group:efSubscription.totals});
                    totalsCursor = collection.aggregate(t,sendTotals);
                }
            }
            else {                                                                                                  //simple find
                if(efSubscription.projection) {
                    cursor = collection.find(f,efSubscription.projection);
                }
                else{
                     cursor = collection.find(f);
                }
            
                if (efSubscription.sort != undefined) { cursor.sort(efSubscription.sort); }
                if (efSubscription.limit != undefined) { cursor.limit(efSubscription.length); }
                cursor.toArray(sendData);

                if(efSubscription.totals && efSubscription.totals._id === undefined) efSubscription.totals._id = null; 
                if(efSubscription.totals) {                                                                     //build totals
                    var t = [{$match:f}];
                    if(!efSubscription.totalsSkipLimits){
                        if (efSubscription.sort != undefined) t.push({$sort:efSubscription.sort}); 
                        if (efSubscription.skip != undefined) t.push({$skip:efSubscription.skip}); 
                        if (efSubscription.limit != undefined) t.push({$limit:efSubscription.limit}); 
                    }
                    t.push({$group:efSubscription.totals});
                    socket.emit('totalsCalculating', { dataSend: efSubscription });
                    totalsCursor = collection.aggregate(t,sendTotals);
                }
            }

            if(cursor){
                cursor.count(function (err, countReturn) {                                                  //update count
                    ss.emit('countReturn', { count: countReturn, dataSend: efSubscription });
                });
            }
        
            function sendData (err, docs) {
                var k = false;
                if(efSubscription.aggregate || efSubscription.group || efSubscription.projection){
                    k = true;
                } else if (_id) {                                                   //in current set
                    for (var i in efSubscription.docs) {
                        if (efSubscription.docs[i].toString() === _id.toString()) {
                            k = true;
                            break;
                        }
                    }
                    if (!k) {                                                           //in new set
                        for (var i in docs) {
                            if (docs[i]._id.toString() === _id.toString()) {
                                k = true;
                                break;
                            }
                        }
                    }
                }
                else {
                    k = true;
                }
                if (k) {                                                                //dont send if not in set
                    if (efSubscription.newAtEnd) {
                        var newObj = {}
                        if ((typeof efSubscription.newAtEnd == "object") && (efSubscription.newAtEnd !== null)) {
                            newObj = efSubscription.newAtEnd;
                        }
                        newObj._id = mongojs.ObjectId();
                        newObj.$isNew = true;
                        docs.push(newObj);
                    }
                    ss.emit('findUpdate', { err: err, docs: docs, dataSend: efSubscription });
                }
            }

            function sendTotals(err, totals) {
                    socket.emit('totalsReturn', { totals: totals, dataSend: efSubscription });
            }
        }
    
        socket.on('delete', function (data) {
            if (!db[data.collection]) collection = db.collection(data.collection);
            var _id = data.docId;
            collection.findOne({ _id: mongojs.ObjectId(_id) }, function (err, oldDoc) {

                var validatedObj = { err: null, oldObj: oldDoc };

                if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].beforeDelete != undefined) {
                    validatedObj.err = publicObj.validation[data.collection].beforeDelete(oldDoc);
                }


                if (validatedObj.err == null) {
                    collection.remove({ _id: mongojs.ObjectId(_id) },
                         function (err, lastErrorObject) {
                        if(err) console.log({ err: err });
                        var f = { collection: data.collection, command: 'find' };
                        if (data.updateMe == false) f.socket = { $ne: socket.id };
                        subscriptions.find(f).toArray(function (err, efSubscriptions) {
                            if (efSubscriptions) efSubscriptions.forEach(function(n){sendFindUpdates(n, mongojs.ObjectId(_id));});
                        });

                        if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].afterDelete != undefined) {
                            publicObj.validation[data.collection].afterDelete(oldDoc);
                        }

                        socket.emit('deleteReturn', { dataSend: data });
                    });
                }

            })
        });

        socket.on('save', function (data) {
                if (!db[data.collection]) collection = db.collection(data.collection);
                var _id = data.doc._id;
                //delete data.doc._id;

                collection.findOne({ _id: mongojs.ObjectId(_id) }, function (err, oldDoc) { //get doc for validation at the colection level
                    if(err) console.log({ err: err, oldDoc: oldDoc });
                    var newDoc = {};
                    for (var i in oldDoc) {                                                //build a new doc from changes
                        if (data.doc.save.$unset && data.doc.save.$unset[i]) { }
                        else {newDoc[i] = oldDoc[i];}
                    }
                    if (data.doc.save.$set) {
                        for (var i in data.doc.save.$set) {
                            newDoc[i] = data.doc.save.$set[i];
                        }
                    }

                    var validatedObj = { err: null, newObj: newDoc };
            
                    if(!oldDoc) oldDoc = {};                                                //call before validation
                    if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].beforeUpdate != undefined) {
                        validatedObj = publicObj.validation[data.collection].beforeUpdate(newDoc, oldDoc);
                    }

                    if (validatedObj.err == null) {
                        for (var i in data.doc.change) {                                   //field level validation
                            if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].keys != undefined && publicObj.validation[data.collection].keys[i] != undefined && publicObj.validation[data.collection].keys[i].beforeUpdate != undefined) {
                                var v =  publicObj.validation[data.collection].keys[i].beforeUpdate(validatedObj.newObj[i], oldDoc[i]);
                                validatedObj.newObj[i] = v.newObj;
                                validatedObj.err = v.err;
                                if (v.err != null) break;
                            }
                        }
                    }

                    if (validatedObj.err == null) {
                        data.doc = deepMatch(validatedObj.newObj, oldDoc);               //strip down validated obj
                        if(data.doc.save.$set || data.doc.save.$unset){
                            collection.findAndModify({                                       //save changes
                                query: { _id: mongojs.ObjectId(_id) },
                                update: data.doc.save,
                                new: true,
                                upsert:true
                            }, function (err, doc, lastErrorObject) {

                                var ef = [];                                                //fields changed
                                for (var i in data.doc.change) {
                                    ef.push(i);
                                }                                                           //find subscriptions that are filtered by chenged fields or in the resultes of a query
                                var f = { collection: data.collection, command: 'find', $or: [{ docs: mongojs.ObjectId(_id) }, {efFields:{$in:ef}}, {aggregate:{$exists:true}}, {group:{$exists:true}}] };
                                if (data.updateMe == false) f.socket = { $ne: socket.id };
                                subscriptions.find(f).toArray(function (err, efSubscriptions) {
                                                                                            //re-runs afected querys 
                                    if (efSubscriptions) efSubscriptions.forEach( function(n){sendFindUpdates(n, mongojs.ObjectId(_id));});
                                });

                                for (var i in data.doc.change) {                            //collection level after update functions
                                    if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].keys != undefined && publicObj.validation[data.collection].keys[i] != undefined && publicObj.validation[data.collection].keys[i].afterUpdate != undefined) {
                                        publicObj.validation[data.collection].keys[i].afterUpdate(validatedObj.newObj[i], oldDoc[i]);;
                                    }
                                }
                                                                                            //field level after update functions
                                if (publicObj.validation[data.collection] != undefined && publicObj.validation[data.collection].afterUpdate != undefined) {
                                    publicObj.validation[data.collection].afterUpdate(doc);
                                }
                                                                                
                                socket.emit('saveReturn', { savedDoc: doc, dataSend: data });
                            });
                        }
                    }

                })



            });

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
                else if (odj1[i] !== odj2[i]) {
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

        function efFields(query) {
            var listOfEfFields = {};
            if (isObject(query) || isArray(query)) {
                for (var i in query) {
                    if ((isObject(query[i]) || isArray(query[i])) && i !== '_id') {
                        var sub = efFields(query[i])
                        for (var j in sub) {
                            listOfEfFields[j] = '1';
                        }
                    }
                    if (i.indexOf('$') == -1 && !isArray(query)) {
                        listOfEfFields[i] = '1';
                    }
                }
            }
            else if (query.indexOf('$') == -1) {
                listOfEfFields[query] = '1';
            }

            return listOfEfFields;
        }
    });

    return publicObj;
    
    };