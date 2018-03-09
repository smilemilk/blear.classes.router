/**
 * 路由
 * @author ydr.me
 * @create 2016-05-19 18:18
 * @update 2018-03-05 10:19
 * @update 2018-03-05 10:19
 * @update 2018年03月07日15:55:10
 */


'use strict';

var Events = require('blear.classes.events');
var access = require('blear.utils.access');
var array = require('blear.utils.array');
var object = require('blear.utils.object');
var qs = require('blear.utils.querystring');
var plan = require('blear.utils.plan');
var url = require('blear.utils.url');
var typeis = require('blear.utils.typeis');
var event = require('blear.core.event');

var Route = require('./route');
var navigate = require('./navigate');

var win = window;
var nativeHistory = win.history;
var STATE_TYPE_IS_PUSH = 0;
var STATE_TYPE_IS_REPLACE = 1;
var STATE_TYPE_IS_POP = 2;
var MODE_OF_HASH = 'hash';
var MODE_OF_PATH = 'path';
var defaults = {
    /**
     * 是否忽略大小写，默认 false
     * @type Boolean
     */
    ignoreCase: false,

    /**
     * 是否严格模式，默认 false，即默认忽略末尾“/”
     * @type Boolean
     */
    strict: false,

    /**
     * hashbang 分隔符
     * @type String
     */
    split: '',

    /**
     * 路由模式，取值：hash、path
     * @type string
     */
    mode: MODE_OF_HASH
};
var Router = Events.extend({
    className: 'Router',
    constructor: function (options) {
        var the = this;

        Router.parent(the);
        the[_options] = object.assign(true, {}, defaults, options);
        the[_namedDirectorList] = [];
        the[_anonymousDirector] = the[_previousRoute] = null;
        // 是否正在解析状态，如果此时有新路由进入，则放弃该路由
        the[_parsingLocation] = the[_destroyed] = false;
        the[_navigator] = navigate(the[_options].mode, the[_options].split);
    },

    /**
     * 中间件路由匹配
     * @param [path]
     * @param loader
     * @returns {Router}
     */
    match: function (path, loader) {
        var args = access.args(arguments);
        var the = this;
        var path2 = args[0];
        var loader2 = args[1];

        if (args.length === 1) {
            loader2 = args[0];
            path2 = null;
        }

        the[_namedDirectorList].push(wrapDirector(path2, loader2));
        return the;
    },

    /**
     * 否则路由不匹配
     * @param [path]
     * @param loader
     * @returns {Router}
     */
    get: function (path, loader) {
        var args = access.args(arguments);
        var the = this;

        if (args.length === 1) {
            the[_anonymousDirector] = wrapDirector(null, args[0]);
        } else {
            the[_namedDirectorList].push(wrapDirector(path, loader));
        }

        return the;
    },

    /**
     * 解决新路径
     * @param to
     * @returns {String}
     */
    resolve: function (to) {
        return this[_navigator].resolve(to);
    },

    /**
     * 跳转到新地址
     * @param to
     * @returns {String}
     */
    redirect: function (to) {
        return this[_navigator].redirect(to);
    },

    /**
     * 重写为新地址
     * @param to
     * @returns {String}
     */
    rewrite: function (to) {
        return this[_navigator].rewrite(to);
    },

    /**
     * 设置 query
     * @param key
     * @param [val]
     * @returns {String}
     */
    setQuery: function (key, val) {
        return this[_navigator].setQuery(key, val);
    },

    /**
     * 移除 query
     * @param key
     * @returns {String}
     */
    removeQuery: function (key) {
        return this[_navigator].removeQuery(key);
    },

    /**
     * 路由开始
     * @returns {Router}
     */
    start: function () {
        var the = this;

        the[_initAnonymousDirector]();
        the[_initPopstateEvent]();
        the[_parseStateByStateType](STATE_TYPE_IS_PUSH);

        return the;
    },

    /**
     * 销毁
     */
    destroy: function () {
        var the = this;

        if (the[_previousRoute]) {
            the[_previousRoute].destroy();
        }

        the[_options] = the[_namedDirectorList] = the[_anonymousDirector] = the[_previousRoute] = null;
        event.un(win, 'popstate', the[_onWindowPopstate]);
        the[_destroyed] = true;
        Router.invoke('destroy', the);
    }
});
var prop = Router.prototype;
var sole = Router.sole;
var _options = sole();
var _namedDirectorList = sole();
var _anonymousDirector = sole();
var _previousRoute = sole();
var _initAnonymousDirector = sole();
var _initPopstateEvent = sole();
var _initClickEvent = sole();
var _onWindowPopstate = sole();
var _parseStateByStateType = sole();
var _parsingLocation = sole();
var _destroyed = sole();
var _navigator = sole();
var _execDirector = sole();

prop[_initAnonymousDirector] = function () {
    var the = this;

    the[_anonymousDirector] = the[_anonymousDirector] || wrapDirector(null, function () {
        // ignore
    });
};

prop[_initPopstateEvent] = function () {
    var the = this;
    var options = the[_options];
    var isDrop = false;

    the[_parseStateByStateType] = function (stateType) {
        // 如果是主动放弃的则不做任何处理，防止导航历史增长
        if (isDrop) {
            isDrop = false;
            return;
        }

        // 如果正在解析
        if (the[_parsingLocation]) {
            isDrop = true;
            history.back();
            return;
        }

        var previousRoute = the[_previousRoute];
        var previousState = previousRoute && previousRoute.state;
        var route = new Route(the[_navigator]);

        // 如果路由没变化就不做任何处理
        if (isSameRoute(previousRoute, route)) {
            route.destroy();
            the.emit('repeat', previousRoute);
            return;
        }

        the.emit('beforeChange', route);
        var loc = the[_parsingLocation] = location.href;
        var state = getState();
        var pathname = route.pathname;
        var matchedNamedDirectorList = [];
        // 这里用时间戳来判断，而不用 id，原因是：
        // id 是一个固定起始值，会与历史记录重复导致方向判断错误
        // 而时间戳是一个自增值，不会与历史记录重复
        var direction = state && previousState &&
        state.timestamp && previousState.timestamp &&
        state.timestamp < previousState.timestamp ? 'backward' : 'forward';

        if (previousRoute && previousRoute.pathname === pathname) {
            direction = 'replace';
        }

        route.assign({
            direction: direction,
            state: state,
            location: loc
        });
        nativeHistory.replaceState(state, null, loc);
        the[_previousRoute] = route;

        if (the[_previousRoute]) {
            the[_previousRoute].destroy();
        }

        plan.each(the[_namedDirectorList], function (index, director, next) {
            // 如果此时路由监听已销毁，则不做任何后续处理
            if (the[_destroyed]) {
                return;
            }

            var directorPath = director.path;
            var matched = false;

            // 具名路径
            if (directorPath) {
                switch (typeis(directorPath)) {
                    case 'string':
                        matched = route.params = url.matchPath(pathname, directorPath, {
                            strict: options.strict,
                            ignoreCase: options.ignoreCase
                        });
                        break;

                    case 'regexp':
                        var matches = pathname.match(directorPath);

                        if (matches) {
                            matched = route.params = array.from(matches);
                        }
                        break;
                }

                if (matched) {
                    matchedNamedDirectorList.push(director);
                }
            }
            // 匿名路径
            else {
                matched = true;
            }

            // 未匹配到
            if (!matched) {
                return next();
            }

            the[_execDirector](route, director, next);
        }).serial(function () {
            // 如果此时路由监听已销毁，则不做任何后续处理
            if (the[_destroyed]) {
                return;
            }

            var end = function () {
                the.emit('afterChange', route);
                the[_parsingLocation] = false;
            };

            // 因为 plan 是异步的
            if (matchedNamedDirectorList.length) {
                end();
            } else {
                the[_execDirector](route, the[_anonymousDirector], end);
            }
        });
    };

    event.on(win, 'popstate', the[_onWindowPopstate] = function (ev) {
        the[_parseStateByStateType](STATE_TYPE_IS_POP);
    });
};

prop[_execDirector] = function (route, director, callback) {
    var execController = function (controller) {
        director.controller = controller;
        route.controller = controller;
        switch (typeis(controller)) {
            // 终点：替换当前 hashbang
            case 'string':
                the[_navigator].rewrite(controller);
                callback(true);
                break;

            case 'undefined':
                // 异步：过渡
                if (director.async) {
                    callback();
                }
                // 同步：终点
                else {
                    callback(true);
                }
                break;

            // 加载的模块
            default:
                callback(true);
                break;
        }
    };

    var controller = director.controller;

    if (controller) {
        execController(controller);
    } else {
        director.loader(execController);
    }
};

Router.defaults = defaults;
module.exports = Router;

// ==================================================================
/**
 * 下一个 state
 * @returns {{timestamp: number}}
 */
function nextState() {
    return {
        timestamp: Date.now()
    };
}

/**
 * 获取当前 state
 * @returns {{id: number, timeStamp: number, timestamp: number}}
 */
function getState() {
    return nativeHistory.state || nextState();
}

var directorId = 0;

/**
 * 包装控制器
 * @param path1
 * @param loader1
 * @returns {{loader: *, path: *, async: boolean}}
 */
function wrapDirector(path1, loader1) {
    var async = false;
    var loader2 = null;

    // 通过回调函数的参数个数来与判断路由回调类型
    // 异步控制器
    // router.match(path, function (resolve) {
    //     resolve(nextPath);
    // });
    if (loader1.length === 1) {
        async = true;
        loader2 = loader1;
    }
    // 默认是同步控制器
    // router.match(path, function () {
    //    do sth.
    // });
    else {
        loader2 = function (next) {
            next(loader1.call(this));
        }
    }

    return {
        id: directorId++,
        loader: loader2,
        path: path1,
        async: async
    };
}

/**
 * 判断是否同一个 route
 * @param a
 * @param b
 * @returns {boolean}
 */
function isSameRoute(a, b) {
    if (!a) {
        return false;
    }

    if (a.pathname !== b.pathname) {
        return false;
    }

    return dumpQuery(a.query) === dumpQuery(b.query);
}

/**
 * 抹平 query
 * @param query1
 * @returns {{}}
 */
function dumpQuery(query1) {
    var query2 = {};
    // 保证 key 是一致的顺序
    var keys = object.keys(query1).sort();
    array.each(keys, function (index, key) {
        var val = query1[key];

        if (typeis.Array(val)) {
            // 保证数组是一致的顺序
            query2[key] = [].concat(val).sort();
        } else {
            query2[key] = val;
        }
    });
    return qs.stringify(query2);
}