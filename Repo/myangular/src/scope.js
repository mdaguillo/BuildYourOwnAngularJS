'use strict';
var _ = require('lodash');

function Scope() {
    // The private collection of 'watchers'. A watcher is an object which contains a watch function, 
    // listener function, and the previous result of the watch function
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;

    function initWatchVal() {}
    

    // Add a new watcher to this scopes internal list of watchers
    Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function() {},
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.push(watcher);
        this.$$lastDirtyWatch = null;

        return function() {
            var index = self.$$watchers.indexOf(watcher);
            if (index >= 0){
                self.$$watchers.splice(index, 1);
            }
        };
    };

    Scope.prototype.$digest = function() {
        var dirty;
        var ttl = 10; // stands for "Time to Live"
        this.$$lastDirtyWatch = null;
        do {
            dirty = this.$$digestOnce();
            if (dirty && !(ttl--)) {
                throw '10 digest iterations reached';
            }
        } while (dirty);
    };

    Scope.prototype.$$digestOnce = function() {
        var self = this;
        var newValue, oldValue, dirty;
        _.forEach(this.$$watchers, function(watcher){
            try {
                newValue = watcher.watchFn(self);
                oldValue = watcher.last;
                if (!self.$$areEqual(newValue, oldValue, watcher.valueEq))
                {
                    self.$$lastDirtyWatch = watcher;
                    watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
                    // The initWatchVal allows us to ensure the listener is called when a new watch is supposed to start with an undefined value.
                    // Setting old value to new value here ensures we don't leak the reference to initWatchVal outside of scope
                    watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
                    dirty = true;
                }
                else if (self.$$lastDirtyWatch === watcher) {
                    return false;
                }
            }
            catch (ex) {
                console.error(ex);
            }
        });

        return dirty;
    };

    Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
        if (valueEq) {
            return _.isEqual(newValue, oldValue);
        }
        else {
            return newValue === oldValue || (typeof newValue === 'number' && isNaN(newValue) && typeof oldValue === 'number' && isNaN(oldValue));
        }
    };
}

module.exports = Scope;