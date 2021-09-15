'use strict';
var _ = require('lodash');

function Scope() {
    // The private collection of 'watchers'. A watcher is an object which contains a watch function, 
    // listener function, and the previous result of the watch function
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null;
    this.$$postDigestQueue = [];
    this.$$phase = null;

    function initWatchVal() {}
    

    // Add a new watcher to this scopes internal list of watchers
    Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
        var self = this;
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function() {},
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.unshift(watcher);
        this.$$lastDirtyWatch = null;

        return function() {
            var index = self.$$watchers.indexOf(watcher);
            if (index >= 0){
                self.$$watchers.splice(index, 1);
                self.$$lastDirtyWatch = null;
            }
        };
    };

    Scope.prototype.$digest = function() {
        var dirty;
        var ttl = 10; // stands for "Time to Live"
        this.$$lastDirtyWatch = null;
        this.$beginPhase('$digest');

        // When a digest is kicked off, drain the applyAsync queue first
        if (this.$$applyAsyncId) {
            clearTimeout(this.$$applyAsyncId);
            this.$$flushApplyAsync();
        }

        do {
            // The eval async queue is promised to complete on the next digest cycle, so kick it off here
            while(this.$$asyncQueue.length) {
                var asyncTask = this.$$asyncQueue.shift();
                asyncTask.scope.$eval(asyncTask.expression);
            }

            dirty = this.$$digestOnce();
            if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
                this.$clearPhase();
                throw '10 digest iterations reached';
            }
        } while (dirty || this.$$asyncQueue.length);
        
        this.$clearPhase();

        while (this.$$postDigestQueue.length) {
            this.$$postDigestQueue.shift()();
        }
    };

    Scope.prototype.$$digestOnce = function() {
        var self = this;
        var newValue, oldValue, dirty;
        _.forEachRight(this.$$watchers, function(watcher){
            try {
                if (watcher)
                {
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

    Scope.prototype.$eval = function(expr, locals) {
        return expr(this, locals);
    };

    Scope.prototype.$evalAsync = function(expr) {
        var self = this;
        if (!self.$$phase && !self.$$asyncQueue.length) {
            setTimeout(function() {
                if (self.$$asyncQueue.length) {
                    self.$digest();
                }
            }, 0);
        }
        this.$$asyncQueue.push({ scope: this, expression: expr }); // store the current scope because of scope inheritence
    };

    Scope.prototype.$apply = function(expr) {
        try {
            this.$beginPhase('$apply');
            this.$eval(expr);
        }
        finally {
            this.$clearPhase();
            this.$digest();
        }
    };
    
    Scope.prototype.$applyAsync = function(expr) {
        var self = this;
        self.$$applyAsyncQueue.push(function() {
            self.$eval(expr);
        });

        if (self.$$applyAsyncId === null) {
            self.$$applyAsyncId = setTimeout(function(){
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            }, 0);
        }  
    };

    Scope.prototype.$$flushApplyAsync = function() {
        while (this.$$applyAsyncQueue.length) {
            this.$$applyAsyncQueue.shift()();
        }

        this.$$applyAsyncId = null;
    };

    Scope.prototype.$beginPhase = function(phase) {
        if (this.$$phase) {
            throw this.$$phase + ' already in progress.';
        }

        this.$$phase = phase;
    };

    Scope.prototype.$clearPhase = function () {
        this.$$phase = null;
    };

    Scope.prototype.$$postDigest = function(fn) {
        this.$$postDigestQueue.push(fn);
    };
}

module.exports = Scope;