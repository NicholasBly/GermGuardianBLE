(function($) {
  "use strict";

  var SERVICE_SIGNATURE = 'guardian';
  var ACCOUNT_LOCALKEY  = 'account';

  var hubeaDelegate = {
    init: function(type, env) {
      var self = this;
      self.serverType = type; // server type 'd' or 'p'
      self.env  = env || {};
      return $._hubeaReady()
        .then(function() {
          return $._makeUserAgent();
        })
        .then(function(info, ua) {
          self.__userAgent = ua;
          self.__isOnHubea = info.isOnHubea;
          if (!self.__isOnHubea) {
            // 無応答になるためskip
            console.debug('setup: not hubea.');
            return '';
          }
          return $._getInstallId();
        })
        .then(function(id) {
          self.__installId = id;
          if (!self.__isOnHubea) {
            // 無応答になるためskip
            console.debug('setup: not hubea.');
            return {};
          }
          return $._storageRead(ACCOUNT_LOCALKEY)
        })
        .then(function(account) {
          var appLoginAccount = {};
          try {
            account = hubea.util.base64ToText(account);
          } catch(e) {}
          try {
            appLoginAccount = JSON.parse(account);
          } catch(e) {}
          self.__loginAccount = appLoginAccount;
        });
    },
    getLoginId: function(username) {
      var self = this;
      var args = {
        installId: self.__installId,
        username: username
      };
      return self.doAuthReq('/users/getLoginId', 'POST', args);
    },
    doAuthReq: function(path, method, data) {
      var self = this;
      var server = self.env.serverUrl;
      method = (method || 'get').toUpperCase();
      data = $.extend(data || {}, {
        userAgent: self.__userAgent,
        hs: self.serverType
      });
      var json = JSON.stringify(data);
      var contentType = '';
      var md5 = ''; // if need(default blank).
      if (method.match(/get/i)) {
        // getの場合、bodyキー
        var params = $.param({body:json}).replace(/!/g, '%21');
        if (0 <= path.indexOf('?')) {
          path += ('&' + params);
        } else {
          path += ('?' + params);
        }
        // random query (prevent cache)
        path += ('&q=' + new Date().getTime());
        data = null;
      } else {
        data = json;
        contentType = 'application/json';
        md5 = md5Func(json);
      }
      return $.Deferred(function($dfd) {
        self.resolveAuthHeader(path, method, contentType, md5)
          .then(function(headers) {
            return $.ajax({
              url: server + path,
              type: method,
              contentType: contentType,
              dataType: 'json',
              data: data,
              cache: true,
              beforeSend: function(xhr, settings) {
                if (settings.type == 'POST' && 0 < md5.length) {
                  xhr.setRequestHeader('Content-MD5', md5);
                }
                if (headers) {
                  Object.keys(headers).forEach(function(key, i) {
                    xhr.setRequestHeader(key, headers[key]);
                  });
                }
              },
              success : $dfd.resolve
            });
          }, function() {
            $dfd.reject({code:'HUBEA_JS_ERROR', message:'Internal Error'});
          })
          .fail(function(jqXHR, textStatus, errorThrown) {
            var args = {
              jqXHR: jqXHR,
              textStatus: textStatus,
              errorThrown: errorThrown
            };
            $dfd.reject({code:'AJAX_ERROR', message:'Network Error', data: args});
          });
      });
    },
    resolveAuthHeader: function(path, method, contType, md5) {
      var self = this;
      var $dfd = $.Deferred();
      var args = {
        httpVerb: method,
        contentMd5: md5,
        contentType: contType,
        contentService: SERVICE_SIGNATURE,
        path: path
      };
      try {
        hubea.security.createAuthHeaders(args, function(result) {
          var headers = result.headers || {};
            // [Guardian Server Spec]
            if (typeof(self.__loginAccount) == 'object' && self.__loginAccount.hasOwnProperty('token')) {
              headers['x-guardian-auth'] = self.__loginAccount['token'];
            }
            $dfd.resolve(headers);
        },
        function() {
          $dfd.reject();
        });
      } catch (e) {
        $dfd.resolve();
      }
      return $dfd.promise();
    }
  };

  // Hubea extentions
  $._hubeaReady = function() {
    return $.Deferred(function($dfd) {
      hubea.ready(function() {
        $dfd.resolve();
      })
    });
  }

  $._makeUserAgent = function() {
    var platform = {
      osName : function() {
        if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
          return 'iOS';
        }
        if (navigator.userAgent.match(/Android/i)) {
          return 'Android';
        }
        return ''; //無い場合はサーバーが読み替える
      },
      model : function() {
        return '';
      },
      fingerprint: function() {
        return '';
      },
      systemVersion : function() {
        var name = this.osName();
        if ('Android' == name) {
          return 18;
        }
        // iOS相当
        return 7;
      },
      idForVendor : function() {
        return '';
      },
      advertisingId : function() {
        return '';
      },
      versionCode : function() {
        return 3;
      },
      appType: function() {
        return '1';
      },
      appVersion : function() {
        return 4;
      },
      buildNumber : function() {
        return '';
      },
      lang : function() {
        try {
          return (navigator.browserLanguage || navigator.userLanguage || navigator.language).substring(0, 2);
        } catch(e) {
          return undefined;
        }
      },
      locale : function() {
        return (navigator.browserLanguage || navigator.userLanguage || navigator.language);
      },
      location : function() {
        return '';
      }
    };
    var uaObj = {
      os: platform.osName(),
      model: platform.model(),
      fingerprint: platform.fingerprint(),
      systemVersion: platform.systemVersion(),
      idForVendor: platform.idForVendor(),
      advertisingId: platform.advertisingId(),
      versionCode: platform.versionCode(),
      appType: platform.appType(),
      appVersion: platform.appVersion(),
      buildNumber: platform.buildNumber(),
      lang: platform.lang(),
      locale: platform.locale(),
      location: platform.location()
    }
    return $.Deferred(function($dfd) {
      try {
        hubea.system.getInfo(function(info) {
          uaObj.os = info.os;
          uaObj.versionCode = info.hubeaInfo.versionCode;
          $dfd.resolve(info, uaObj);
        },
        function() {
          $dfd.reject('[ERR] nativeIF getInfo error.');
        });
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  $._getInstallId = function() {
    return $.Deferred(function($dfd) {
      try {
        hubea.app.getInstallId(function(id) {
          $dfd.resolve(id);
        });
      } catch (e) {
        return $dfd.reject(e);
      }
    });
  }

  $._storageRead = function(key) {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.localStorage.getItem(key,
          function(data) {
            $dfd.resolve(data);
          },
          function(e) {
            $dfd.reject(e);
          }
        );
      } catch (e) {
        this.reject(e);
      }
    });
  }

  function md5Func(src) {
    if (typeof CryptoJS =='undefined' || typeof CryptoJS.MD5 == 'undefined') {
      return '';  // if need(default blank).
    }
    return CryptoJS.MD5(src).toString(CryptoJS.enc.Base64);
  }

  window.hubeaDelegate = hubeaDelegate;

})(jQuery);
