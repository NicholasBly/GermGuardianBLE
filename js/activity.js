/**
 * Activityの制御を簡便にする
 * 以下のjsが先にロードされている必要がある
 * - jQuery
 * - hubea.js
 */
var Activity = {};

(function($) {
  var _preventTouchTimerId;
  var _events = ['onPause', 'onResume']
  var _eventHandlers = {};

  /**
   * JM1タッチ発火抑止
   */
  Activity.preventTouchTimerStart = function(uniqueId, interval) {
    if (_preventTouchTimerId) {
      clearInterval(_preventTouchTimerId);
    }
    if (interval < 0) {
      interval = 0;
    }
    _preventTouchTimerId = setInterval(function () {
      try {
        hubea.jm1.pauseDeviceTouchEvent({jm1UniqId: uniqueId, time: interval + 1000},
          function () {
          },
          function () {
            log('pauseDeviceTouchEvent failed.');
          }
        );
      } catch (e) {
        console.error(e);
      }
    }, interval);
  }

  Activity.preventTouchTimerStop = function() {
    if (_preventTouchTimerId) {
      clearInterval(_preventTouchTimerId);
      _preventTouchTimerId = null;
    }
  }

  // 別画面(アプリ画面として)を起動する
  Activity.launchActivity = function(url, params) {
    try {
      // paramsは直下のpropertyしか対象としない。またvalueがprimitiveではないものは無視
      if ($.isPlainObject(params)) {
        var urlData = hubea.util.parseUrl(url);
        var queryParams = urlData.queryParams || {};
        var queryText = '', fragmentText = '';
        Object.keys(params).filter(function(key) {
          return (0 <= ['number', 'string', 'boolean'].indexOf(typeof(params[key])));
        })
        .forEach(function(key) {
          queryParams[key] = params[key];
        });
        queryText = Object.keys(queryParams).map(function(key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]);
        }).join('&');
        if (queryText) {
          queryText = '?' + queryText;
        }
        if (urlData.fragment) {
          fragmentText = '#' + encodeURIComponent(urlData.fragment);
        }
        url = urlData.noParamUrl + queryText + fragmentText;
      }
      hubea.system.activity.start({url: url});
      return true;
    } catch (e) {
      log('launchActivity error:' + e);
      return false;
    }
  }

  // 別アプリを起動する
  Activity.launchApp = function(uri) {
    try {
      hubea.system.launchApp({uri: uri});
      return true;
    } catch (e) {
      log('launchApp error:' + e);
      return false;
    }
  }

  // 更新されたApplicationCacheが利用可能な場合はページをリロードさせる
  // それ以外の場合は何もせずfalseを返す
  Activity.swapAvailableCache = function(clean) {
    var appCache = window.applicationCache;
    if (appCache && appCache.status === appCache.UPDATEREADY) {
      try {
        if (clean) {
          var urlData = hubea.util.parseUrl(window.location.href);
          hubea.system.activity.load({url: urlData.noParamUrl});
        } else {
          window.location.reload();
        }
        return true;
      } catch (e) {
        log('swapAvailableCache:' + e);
      }
    }
    return false;
  }

  // LocalStorageへデータを保存する(string or object)
  Activity.save = function(key, data, callback) {
    if (typeof data == 'object') {
      data = JSON.stringify(data);
    }
    $Activity.storageSave(key, data)
      .always(function() {
        _doCallback(callback);
      });
  }

  // LocalStorageのデータを読み出す(string or object)
  Activity.load = function(key, callback) {
    $Activity.storageRead(key)
      .done(function(value) {
        try {
          value = JSON.parse(value);
        } catch (e) {
        }
        _doCallback(callback, Array.isArray(value) ? [value] : value);
      })
      .fail(function() {
        _doCallback(callback);
      });
  }

  Activity.closeSelf = function(args) {
    try {
      hubea.system.activity.finish({result: args},
        function() {
          log('hubea.system.activity.finish OK.');
        },
        function() {
          log('hubea.system.activity.finish failed.');
        }
      );
    } catch (e) {
      console.error(e);
    }
  }

  // この画面に復帰したタイミングで自動的に終了させる
  Activity.setAutoClose = function(args) {
    try {
      Activity.addEventListener('onResume', function() {
        log('onResume event.');
        Activity.closeSelf(args);
      }, true);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * エラー終了
   */
  Activity.fatalExit = function(message) {
    if (message) {
      try {
        var args = {
          title: 'Fatal ERROR',
          message: message
        };
        Activity.showDialog(args, Activity.closeSelf);
      } catch (e) {
        Activity.closeSelf();
      }
    } else {
      Activity.closeSelf();
    }
  }

  /**
   * ダイアログ表示(タイトル、メッセージのみ)
   * @param {title:string, message:string, positive:string, negative:string}: params
   * @param (=Function): callback
   */
  Activity.showDialog = function(params, callback) {
    if (params) {
      try {
        var args = {
          title: params.title,
          message: params.message,
          positive: params.positive || 'OK',
          negative: params.negative
        };
        hubea.system.activity.showAlertDialog(args, callback, callback);
      } catch (e) {
        _doCallback(callback);
      }
    } else {
      _doCallback(callback);
    }
  }

  /**
   * 起動パラメータ取得
   */
  Activity.getParams = function(callback) {
    try {
      hubea.system.activity.getParams(
        function(params) {
          // NOTE: params.fragment は decode 済みであり、デバイス名に '&', '=' が
          //       含まれていると正しくパースできないため直接 Location オブジェクトを
          //       参照している
          var hash = (location.hash) ? location.hash.substring(1) :  null;
          params.fragmentParams = parseKeyValues(hash);
          _doCallback(callback, params);
        },
        function() {
          _doCallback(callback);
        }
      );
    } catch (e) {
      _doCallback(callback);
    }
  }

  /**
   * 画面の戻り値(最新だけ)取得
   */
  Activity.getLastResult = function(callback) {
    try {
      hubea.system.activity.getResult(
        function(result) {
          _doCallback(callback, result);
        },
        function() {
          _doCallback(callback);
        }
      );
    } catch (e) {
      _doCallback(callback);
    }
  }

  /**
   * タッチしたデバイスの JM1 Unique ID を取得する
   * タッチ起動で無い場合は null が返される
   */
  Activity.getTouchedUniqueId = function(callback) {
    try {
      hubea.jm1.getTouchedDeviceId({},
        function(result) {
          hubea.debug.log( JSON.stringify(result) );
          var uniqueId = null;
          if (result) {
            if (result.serviceUuid && typeof result.serviceUuid !== 'undefined') {
              uniqueId = getUniqueId(result.serviceUuid);
            } else if (result.jm1UniqId && typeof result.jm1UniqId !== 'undefined') {
              uniqueId = result.jm1UniqId;
            }
          }
          _doCallback(callback, uniqueId);
        }, function() {
          hubea.debug.log('getTouchedDeviceId failed.');
          _doCallback(callback);
        }
      );
    } catch (e) {
      hubea.debug.log('getTouchedDeviceId error.');
      _doCallback(callback);
    }
  }

  Activity.getBrowserLanguage = function() {
    try {
      return (navigator.browserLanguage || navigator.userLanguage || navigator.language).substr(0, 2);
    } catch(e) {
      return undefined;
    }
  }

  function _doCallback(callback, args) {
    if (typeof callback === 'function') {
      setTimeout(function() {
        callback.apply(null, Array.isArray(args) ? args : [args]);
      }, 0);
    }
  }

  function getUniqueId(serviceUuid) {
    if (serviceUuid) {
      var matches = serviceUuid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{2}([0-9a-f]{2})-[0-9a-f]{4}-([0-9a-f]{6})[0-9a-f]{6}/i);
      if (matches.length == 3) {
        return matches[1] + matches[2];
      }
    }
    return null;
  }

  // クエリ、フラグメントの解析
  function parseKeyValues(keyValuesString) {
    var result = {};
    if (keyValuesString) {
      var vars = keyValuesString.split('&'), pair;
      vars.forEach(function(keyValue) {
        pair = keyValue.split('=');
        if (pair.length == 2) {
          result[pair[0]] = decodeURIComponent(pair[1]);
        } else {
          console.error("parse error: " + keyValue);
        }
      });
    }
    return result;
  }

  // Event Handlers
  Activity.addEventListener = function(event, listener, once) {
    if (typeof(listener) !== 'function') {
      return;
    }
    if (_events.indexOf(event) < 0) {
      console.error('Unexpected event name:' + event);
      return;
    }
    if (!_eventHandlers.hasOwnProperty(event)) {
      _eventHandlers[event] = [];
    } else {
      _eventHandlers[event] = _eventHandlers[event].filter(function(handler) {
        return (handler && handler.listener != listener);
      });
    }
    _eventHandlers[event].push({
      listener: listener,
      once: once
    });
  }

  Activity.removeEventListener = function(event, listener) {
    if (!_eventHandlers.hasOwnProperty(event)) {
       return;
    }
    _eventHandlers[event] = _eventHandlers[event].filter(function(handler) {
      return (handler && handler.listener != listener);
    });
  }

  _events.forEach(function(event) {
    (function(event) {
      hubea.event.bind(event, function() {
        if (!_eventHandlers.hasOwnProperty(event)) {
          return;
        }
        _eventHandlers[event] = _eventHandlers[event].filter(function(handler) {
          if (handler) {
            if (handler.listener) {
              try {
                _doCallback(handler.listener);
              } catch (e) {}
            }
            return handler.once ? false : true;
          }
          return false;
        });
      });
    })(event);
  });

  // jQuery deferred
  var $Activity = {};

  $Activity.storageSave = function(key, value) {
    return $.Deferred(function($dfd) {
      try {
//console.log('_storageSave() key[' + key + '] <---- value[' + value + ']');
        hubea.service.localStorage.setItem(key, hubea.util.toBase64(value),
          function() {
            $dfd.resolve();
          },
          function() {
            $dfd.reject('[ERR] nativeIF setItem error.');
          }
        );
      } catch (e) {
        console.error(e);
        this.reject(e);
      }
    });
  }

  $Activity.storageRead = function(key) {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.localStorage.getItem(key,
          function(data) {
          var value = hubea.util.base64ToText(data);
//console.log('_storageRead() key[' + key + '] ----> value[' + value + ']');
            $dfd.resolve(value);
          },
          function() {
            $dfd.reject('[ERR] nativeIF getItem error.');
          }
        );
      } catch (e) {
        console.error(e);
        this.reject(e);
      }
    });
  }

  $Activity.storageRemove = function(key) {
    return $.Deferred(function($dfd) {
      try {
//console.log('_storageRemove() key[' + key + ']');
        hubea.service.localStorage.removeItem(key,
          function() {
            $dfd.resolve();
          },
          function() {
            $dfd.reject();
          }
        )
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  $Activity.storageClear = function() {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.localStorage.clear(
          function() {
            $dfd.resolve();
          },
          function() {
            $dfd.reject();
          }
        );
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  // jQuery plug-in functions
  $.fn.pressable = function() {
    return $(this)
      .on('touchstart', function(e) {
        $(this).addClass('pressed');
        e.stopPropagation();
      })
      .on('touchend touchcancel', function(e) {
        $(this).removeClass('pressed');
      });
  };
  $.fn.unpressable = function() {
    return $(this).removeClass('pressed').off('touchstart touchend touchcancel');
  };

  $.fn.swipe = function() {
    var supportTouch = 'ontouchend' in document;
    return $(this)
      .on(supportTouch ? 'touchstart':'mousedown', touchStart)
      .on(supportTouch ? 'touchmove' :'mousemove', touchMove)
      .on(supportTouch ? 'touchend touchcancel':'mouseup', touchEnd);

    function touchStart(event) {
      $(this).data({se: null, sx: getX(event)});
    }

    function touchMove(event) {
      var $this = $(this);
      var sx = $this.data('sx');
      var sw = $this.width() * 0.2;
      var dx = sx - getX(event), se = null;
      if (sw < dx) {
        se = 'swipeLeft';
        event.preventDefault();
      } else
      if (dx < sw*(-1)) {
        se = 'swipeRight';
        event.preventDefault();
      }
      // event.preventDefault();
      $this.data('se', se);
    }

    function touchEnd(event) {
      var $this = $(this);
      var se = $this.data('se');
      if (se) {
        $this.trigger(se, [$this]);
      }
      $this.removeData(['se','sx']);
    }

    function getX(event) {
      if (event.originalEvent instanceof TouchEvent) {
        return event.originalEvent.changedTouches[0].pageX;
      }
      return event.pageX;
    }
  }

})(jQuery);
