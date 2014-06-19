var ngMongoModule = angular.module('ngMongo', []);


ngMongoModule.provider('$SocketsIo', [function () {
    var me = {connected:false};
    //me.url = 'https://localhost.com';
    //me.url = 'http://3ccmvy1.crowell.com';
    me.url = 'http://localhost';
    me.qList = {};
    me.rIdGen = function () { return Math.random().toString() + Math.random().toString(); };
    me.isFunction = function (functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    }

    me.connect = function () {
        if (me.connected == true ) {
            return true;
        }
        me.socket = io.connect(me.url);
        me.connected = true;

        me.socket.on('publicFunctionReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].publicFunctionReturn) {
                me.qList[data.dataSend.requestId].publicFunctionReturn(data.err, data.dataReturned, data.dataSent);
            }
        });
        me.socket.on('findReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findReturn) {
                me.qList[data.dataSend.requestId].findReturn(data.err, data.docs, data.dataSent);
            }
        });
        me.socket.on('findUpdate', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findUpdate) {
                me.qList[data.dataSend.requestId].findUpdate(data.err, data.docs, data.dataSent);
            }
        });
        me.socket.on('findMoreReturn', function (data) {
            if (me.qList[data.dataSend.requestId] && me.qList[data.dataSend.requestId].findMoreReturn) {
                me.qList[data.dataSend.requestId].findMoreReturn(data.err, data.docs, data.dataSent);
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
    }
    this.$get = function () {
        return me;
    }
    
}]);

ngMongoModule.service('$mongo', ['$SocketsIo', '$timeout', '$server', function ($SocketsIo, $timeout, $server) {
    this.query = function (collection) {
        if ($SocketsIo.connected == false) $SocketsIo.connect();
        var arrayResutls = [], count = 0, find, progress = 1, hasBeenCalled = false,totalsSkipLimits = true,totalsObj = {}, totals, totalsCalculatingDefault = 'Calculating...', projection, limit = null, sort = null,group = null, aggregate = null, progressCallBack, progressInc = .25, localVars = {}, newAtEnd = false, rid = $SocketsIo.rIdGen(), newDoc = doc, afterUpdate;
        function clearQList() { if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; }; };

        arrayResutls.$toArray = function (toArrayCallBack) {
            arrayResutls.$cancel();
            rid = $SocketsIo.rIdGen();
            progress = 0;
            var data = { collection: collection, requestId: rid, find: find, progress: progressInc, newAtEnd: newAtEnd, length:1000, more: false, totalsSkipLimits: totalsSkipLimits }
            if(limit) {
                data.limit = limit;
                data.length = arrayResutls.length + limit;
            }
            if(sort) data.sort = sort;
            if(aggregate) data.aggregate = aggregate;
            if(group) data.group = group;
            if(totals) data.totals = totals;
            if(projection) data.projection = projection;

            hasBeenCalled = true;
            $SocketsIo.socket.emit('find', data);
             
            $SocketsIo.qList[rid] = {
                findReturn: function (err, docs, sentData) {
                    $timeout(function () {
                        progress = 1;
                        arrayResutls.$clear();
                        for (var i = 0; i < docs.length; i++) {
                            if (!localVars[docs[i]._id.toString()]) localVars[docs[i]._id.toString()] = {};
                            arrayResutls.push(newDoc(docs[i], collection, localVars[docs[i]._id.toString()],arrayResutls));
                        }
                    });
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
                    $timeout(function () {
                        progress = 1;
                        arrayResutls.$clear();
                        for (var i = 0; i < docs.length; i++) {
                            if (!localVars[docs[i]._id.toString()]) localVars[docs[i]._id.toString()] = {};
                            arrayResutls.push(doc(docs[i], collection, localVars[docs[i]._id.toString()]));
                        }
                        if(afterUpdate != null) afterUpdate();
                    });
                },
                totalsReturn:function(totals,sentData){
                    $timeout(function(){
                        totalsObj.results = totals;    
                    });    
                }
            };

            return arrayResutls;
        };

        arrayResutls.$find = function (findQ) {
            find = findQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$aggregate = function (aggregateQ) {
            aggregate = aggregateQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };

        arrayResutls.$group = function (groupQ) {
            group = groupQ;
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

        arrayResutls.$clear = function () { arrayResutls.splice(0, arrayResutls.length); return this; };

        arrayResutls.$count = function () { return count; };

        arrayResutls.$saveAll = function (updateMe) {
            for (var i in arrayResutls) {
                if (arrayResutls[i] && arrayResutls[i].$save) arrayResutls[i].$save(updateMe);
            }
            return arrayResutls;
        };

        arrayResutls.$afterUpdate = function (afterUpdateQ) {
            afterUpdate = afterUpdateQ;
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

        arrayResutls.$more = function (moreQ) {
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

            $SocketsIo.socket.emit('find', data);

            $SocketsIo.qList[rid].findMoreReturn = function (err, docs, sentData) {
                    $timeout(function () {
                        progress = 1;
                        for (var i = 0; i < docs.length; i++) {
                            if (!localVars[docs[i]._id.toString()]) localVars[docs[i]._id.toString()] = {};
                            arrayResutls.push(newDoc(docs[i], collection, localVars[docs[i]._id.toString()],arrayResutls));
                        }
                        if(afterUpdate != null) afterUpdate();
                    });
                };


            return this;
        };

        arrayResutls.$newAtEnd = function (newAtEndQ) {
            newAtEnd = newAtEndQ;
            if(hasBeenCalled) this.$toArray();
            return this;
        };
        return arrayResutls;
    }

    this.doc = doc;

    function doc(theDoc, collection, localVar, parentQuery) {
        var rid = $SocketsIo.rIdGen(), inProgress = false;
        theDoc.localVar = localVar;
        if (!theDoc.localVar) theDoc.localVar = {};
        theDoc.localVar.$oldDoc = strippedDoc();
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
        function clearQList() { if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; }; };
        theDoc.$save = function (updateMe) {
            theDoc.$cancelSave();
            rid = $SocketsIo.rIdGen();
            inProgress = true;
            var data = { collection: collection, requestId: rid, doc: deepMatch(strippedDoc(), strippedDoc(theDoc.localVar.$oldDoc)) };
            if (theDoc.$isNew == true) {
                data.doc = deepMatch(strippedDoc(), { _id: theDoc._id });
                data.$isNew = true;
            }

            if (data.doc.change && Object.keys(data.doc.change).length > 0) {
                if (updateMe) data.updateMe = updateMe;
                //console.log(deepMatch(strippedDoc(), strippedDoc(theDoc.localVar.$oldDoc)));
                $SocketsIo.socket.emit('save', data);
                theDoc.localVar.$oldDoc = strippedDoc();
                $SocketsIo.qList[rid] = {
                    saveReturn: function (savedDoc) {
                        $timeout(function () {
                            inProgress = false;
                        });
                    }
                }
            }
            return this;
        };

        theDoc.$delete = function (updateMe) {
            
            rid = $SocketsIo.rIdGen();
            inProgress = true;
            var data = { collection: collection, requestId: rid, docId:theDoc._id };
            if (updateMe) data.updateMe = updateMe;
            $SocketsIo.socket.emit('delete', data);
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

ngMongoModule.service('$server', ['$SocketsIo', '$timeout', '$q', function ($SocketsIo, $timeout, $q) {
    this.functions = function (functionName, data) {
        var defer = $q.defer();
        var rid = $SocketsIo.rIdGen();
        $SocketsIo.socket.emit('publicFunction', { functionName: functionName, requestId: rid, data:data });
        $SocketsIo.qList[rid] = {
            publicFunctionReturn: function (err, data, sentData) {
                //$timeout(function () {
                if ($SocketsIo.qList[rid]) { delete $SocketsIo.qList[rid]; };
                defer.resolve(data);
                //});
            }
        }
        return defer.promise;
    };
}]);


