/**
 * Guardian コンテンツ向け
 * 主にコンテンツとhubeaサーバ間，Guardianサーバ間のコミュニケーション機能を提供する
 * 以下のjsが先にロードされている必要がある
 * - jQuery
 * - hubea.js
 * - aspe.js
 */
(function($) {
  "use strict";
  if (typeof $ == 'undefined') {
    console.error('jquery not found.');
  }
  if (typeof hubea == 'undefined') {
    console.error('hubea is undefined.');
  }
  if (typeof ASPE == 'undefined') {
    console.error('ASPE is undefined.');
  }

  var GUARDIAN_JM1_TYPE = 93240; // JM1 type
  var BWG_JM1_TYPE = 82567;

  var GUARDIAN_PRODUCT_CODES = [
    '33A700D60A', //APZ-453 (ver.2.5)
    'EE7C07A00A', //APZ-451 (ver.2.5)
    '0D15D3D004', //APZ-451 (ver.2.4)
    '03AD259009', //APZ-451 (ver.2.3)
    '4DABB74601', //APZ-451 (ver.2.2)
    'E00DC04E01', //APZ-451 (ver.2.1)
    '9136315208'  //APZ-451 (ver.2.0)
  ];
  var BWG_PRODUCT_CODES = [
    '95B4B90C09', //APZ-454 (ver.2.3)
    'BD13D50609', //APZ-452 (ver.2.3)
    '5430D9BC06', //APZ-452 (ver.2.2)
    'B25F005C0A', //APZ-452 (ver.2.1)
    '6080C5E205'  //APZ-452 (ver.2.0)
  ];

  var GUARDIAN_JM1_TYPES = [
    GUARDIAN_JM1_TYPE,
    BWG_JM1_TYPE
  ];

  var GUARDIAN_LKEY_ID  = 1;      //default localKeyId
  // JM1 Unique IDとLocalKeyのマップをLocalStorageに保存するキー
  // 値は以下の形式(JSON)とする(serviceUuidは変動するので永続化対象外とする)
  // {
  //   "keys":[
  //     {
  //       "id": string (uniqueId),
  //       "handle": string (deviceHandle),
  //       "key": string (LocalKey),
  //       "productCode": string (productCode),
  //       "date": number (unix epoc)
  //     },
  //     ....
  //   ]
  // }
  var SKEY_LOCALKEY = 'localKey';
  var SKEY_ACCOUNT  = 'account';

  var CONTENTS_SERVER_SIGNATURE  = 'guardian';
  var BWG_RELAY_SERVER_SIGNATURE = 'bwgsetting';

  /**
   * constructor
   * @param opts {
   *   jm1Types: Array<number>(option)       <-- JM1検索時のtypes(変更があれば)
   *   localKeyId: number(option)     <-- localKeyId(変更があれば),
   *   dataCommTimout: number(option)  <-- データ送受信に使用するcommunicationの切断タイムアウト値。単位はms (初期値:5000)
   *   hubeaServerUrl: string(option) <-- hubeaサーバーアプリ(bcnapp)のURL(/終端無し)
   *   guardianServerUrl: string(option)  <-- guardianサーバーアプリ(guardian)のURL(/終端無し)
   *   debug: number <-- ログレベル設定(0:error、1:warn、2:info、3:log、4:debug、5:trace [初期値:0])
   * }
   */
  var Guardian = function(opts) {
    return (this instanceof Guardian) ? this._init(opts) : new Guardian(opts);
  };
  // DEVICE MODELS
  Guardian.DeviceModels = [
    {
      model: 'Purifier',
      productCodes: GUARDIAN_PRODUCT_CODES,
      jm1Type: GUARDIAN_JM1_TYPE
    },
    { model: 'BwGateway',
      productCodes: BWG_PRODUCT_CODES,
      jm1Type: BWG_JM1_TYPE
    }
  ];
  // WEB LINK
  Guardian.Link = {
     SIGNUP: 'accounts/signup.html',
     ACCOUNT_RESET_PASSWORD: 'accounts/reset_password.html',
     ACCOUNT_SETTING: 'accounts/home.html'
  };
  Guardian.ErrorTypes = {
     UNKNOWN            : 0x01,
     INVALID_PARAM      : 0x02,
     CONNECTION_FAIL    : 0x03,
     CONNECTION_BUSY    : 0x04,
     INRANGE_TIMEOUT    : 0x05,
     WRITE_ERROR        : 0x06,
     READ_ERROR         : 0x07,
     READ_TIMEOUT       : 0x08,
     MESSAGE_ERROR      : 0x09,
     NETWORK_ERROR      : 0x0A,
     AJAX_ERROR         : 0x0B,
     HS_ERROR           : 0x0C,
     CS_ERROR           : 0x0D,
     HUBEA_JS_ERROR     : 0x0E,
     /* Guardian Server Error */
     GS_INVALID_REQ        : -1,
     GS_NO_PAIRED_BWG      : -2,
     GS_UNAUTHORIZED       : -3,
     GS_RELAY_FAILED       : -4,
     GS_INVALID_ACCOUNT    : -5,
     GS_INVALID_SESSION    : -6,
     GS_NO_WIFI_SETTING    : -7,
     GS_NO_CONNECABLE_BWG  : -101,
     GS_TIMEOUT            : -102,
     GS_INVALID_PIN        : -200
  };
  // Inherit
  Guardian.prototype.__proto__ = ASPE;

  /**
   * オブジェクトをセットアップする(利用開始前に実行しておく必要あり）
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.setup = function(success, fail) {
    var self = this;

    // hubea.js初期化待ち
    $._hubeaReady().then(function() {
      // hubea情報取得
      return $._getSystemInfo();
    }).then(function(info) {
      self.__systemInfo = info || {};
      if (!self.__systemInfo.isOnHubea) {
        // 無応答になるためskip
        return;
      }
      // userAgent情報取得
      return $._getHubeaUserAgent();
    }).then(function(ua) {
      self.__userAgent = ua || {};
      if (!self.__systemInfo.isOnHubea) {
        // 無応答になるためskip
        return '';
      }
      // installId取得
      return $._getInstallId();
    }).then(function(installId) {
      self.__installId = installId;
      // localStorage上のlogin状態の読み出し
      return self._loadLoginState();
    }).then(function() {
      if (self.isLoggedIn()) {
        var account = self.__loginAccount;
        if (account.hasOwnProperty('installId')) {
          // installIdが変更された場合はSession情報と登録機器情報は破棄する
          if (account.installId !== self.__installId) {
            self.__loginAccount = {};
            return $._storageRemove(SKEY_LOCALKEY);
          }
        } else {
          // installId自体が保存されていない場合は現在のinstallIdを保存しておく
          self._storeLoginState();
        }
      }
      // localStorage上のlocalKey読み出し
      return self._loadDeviceData();
    }).done(function() {
      self._callback(success);
    }).fail(function(err, data) {
      if (!err) {
        err = Guardian.ErrorTypes.UNKNOWN;
      }
      self.error(err);
      self._callback(fail, [err, data]);
    });
  }

  /**
   * 周辺のJM1デバイスから指定されたJM1 Unique IDに該当するオブジェクトを取得する
   * 見つかるまで粘ったりはしないのでhubea起動直後だと何も取れない場合がある
   * view側で一定期間繰り返し呼び出す想定
   *
   * @param uniqueId: 検索するJM1 Unique ID
   * @param {function(device:Device)} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.findDevice = function(uniqueId, success, fail) {
    var self = this;
    var foundDevice;
    var args = {
      types: self.__jm1Types
    };
    var jm1UniqueFilter = function(uniqueId, jm1s) {
      //self.debug('jm1s:', jm1s);
      for (var i = 0; i < jm1s.length; i++) {
        var jm1 = jm1s[i];
        // productCodeの得られないデバイス または serviceUuid，jm1UniqId両方共得られないデバイスは除外する
        if (!jm1.productCode || (!jm1.serviceUuid && !jm1.jm1UniqId)) {
          continue;
        }
        // uniqueIdが一致しないデバイスは除外する
        var nearbyUniqId = jm1.jm1UniqId || uniqueIdFromUuid(jm1.serviceUuid);
        if (nearbyUniqId != uniqueId) {
          console.warn('nearbyUniqId unmatch:' + nearbyUniqId + ' to ' + uniqueId);
          continue;
        }
        var device = self._findCachedDevice(uniqueId);
        if (device) {
          device.deviceHandle = null; // deviceHandleは更新されたjm1情報から取り直す
          device.jm1 = jm1;  //cache情報の場合更新しておく
        } else {
          device = self._createDevice(jm1);
          if (device) {
            self.__cachedDevices[device.getUniqueId()] = device;
          }
        }
        return device;
      }
    }

    $._getNearbyJm1s(args)
      .then(function(jm1s) {
        // 周辺検索した場合のみ
        foundDevice = jm1UniqueFilter(uniqueId, jm1s);
        if (foundDevice) {
          // この時点ではdeviceId, product nameは分かっていないためattachする
          return self._attachDeviceInfo(foundDevice, false);
        }
      })
      .done(function() {
        // 該当無しの場合はundefinedのまま返却
        self._callback(success, foundDevice);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * 周辺のJM1デバイスオブジェクトの一覧を取得する
   * サーバーの情報は取得しないので登録されているかどうかも関知しない
   * 見つかるまで粘ったりはしないのでhubea起動直後だと何も取れない場合がある
   * view側で一定期間繰り返し呼び出す想定
   *
   * @param {function(device:Device)} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.findDevices = function(success, fail) {
    var self = this;
    var args = {
      types: self.__jm1Types
    };
    var devices = [];
    var $queries = [];
    var jm1Filter = function(jm1s) {
      jm1s.forEach(function(jm1, i) {
        // productCodeの得られないデバイスは除外する
        if (!jm1.productCode) {
          return;
        }
        var uniqueId;
        // serviceUuid，jm1UniqId両方共得られないデバイスは除外する
        if (!jm1.serviceUuid) {
          if (!jm1.jm1UniqId) {
            return;
          }
          uniqueId = jm1.jm1UniqId;
        } else {
          uniqueId = uniqueIdFromUuid(jm1.serviceUuid);
        }
        var device = self._findCachedDevice(uniqueId);
        if (device) {
          device.jm1 = jm1;  //cache情報の場合更新しておく
        } else {
          device = self._createDevice(jm1);
        }
        if (device) {
          devices.push(device);
          $queries.push(self._attachDeviceInfo(device, false));
        }
      });
    }

    $._getNearbyJm1s(args)
      .then(function(jm1s) {
        jm1Filter(jm1s);
        return $.when.apply($, $queries);
      })
      .done(function() {
        self._callback(success, [devices]);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * 周辺のJM1デバイスから登録可能なデバイスを検索する
   * 登録可能なデバイスとは、JM1がその状態の時のみアドバタイズするProduct Beaconを受信しているかどうかで判定する
   * そのため、検索するuuidは予めサービスに登録されている必要がある
   *
   * @param foundFrom: フィルタする受信時刻(Unix EPOCH, 指定された時刻より古いものはフィルタ、未指定時はフィルタなし)
   * @param {function(device:Device)} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.findRegisterableDevices = function(foundFrom, success, fail) {
    var self = this;

    var GUARDIAN_I_UUID  = 'E7A5423F-3BE6-1801-A753-001C4DDF8534';
    //var BWG_NW_UUID      = '0A9F8727-3BE6-1801-85F2-001C4DE6D256';
    var BWG_I_UUID       = '6D50F4F3-3BE6-1801-8332-001C4D5900E3';

    var devices = [];
    var $queries = [];
    var beaconFilter = function(beacons) {
      var uniqueIds = [];
      beacons.sort(function(a, b) {
        return b.lastReceived - a.lastReceived;
      }).filter(function(beacon) {
        return (beacon.lastReceived && (!foundFrom || foundFrom <= beacon.lastReceived));
      }).forEach(function(beacon) {
        switch(beacon.proximityUuid) {
        case GUARDIAN_I_UUID:
        //case BWG_NW_UUID:
        case BWG_I_UUID:
          break;
        default:
          return;
        }
        var uniqueId = ('0000000' + (beacon.major << 16 | beacon.minor).toString(16).toUpperCase()).slice(-8);
        // 重複チェック
        if (0 <= uniqueIds.indexOf(uniqueId)) {
          return;
        }
        $queries.push($.Deferred(function($dfd) {
          self.findDevice(uniqueId,
            function(device) {
              if (device) {
                devices.push(device);
              }
              $dfd.resolve();
            },
            function(err) {
              $dfd.resolve();
            }
          );
        }));
        uniqueIds.push(uniqueId);
      });
      return uniqueIds;
    };

    $._getNearbyBeacons({type:0})
      .then(function(beacons) {
        beaconFilter(beacons);
        return $.when.apply($, $queries);
      })
      .done(function() {
        self._callback(success, [devices]);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * デバイス初期登録時の推奨名を生成する
   * 推奨名のベースは各デバイスのproductName(言語設定毎に変化)として採番する
   * ユーザーがhubeaサーバーに登録しているデバイス名と重複しない名前を検索する
   *
   * @param {Guardinan.Device} device - 対象デバイス
   * @param {Function(deviceName:string)} complete - 完了時に呼び出されるコールバック
   */
  Guardian.prototype.findRecommendDeviceName = function(device, complete) {
    var self = this;
    var name;

    // 検索時のキーワードはproductName
    self._searchDeviceName(device.productName)
      .then(function(deviceNames) {
        // 既に登録済みのデバイス名が含まれる場合はその名前を返す
        for (var i = 0; i < deviceNames.length; i++) {
          var set = deviceNames[i];
          if (set.uniqueId === device.getUniqueId()) {
            name = set.deviceName;
            break;
          }
        }
        if (!name) {
          // 登録済みのデバイス名が無い場合、他と重複しない名前を採番
          name = device.productName; // default
          var num = 1;
          while (deviceNames.some(function(set) { return set.deviceName == name; })) {
            name = device.productName + '[' + num++ + ']';
          }
        }
        self._callback(complete, name);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(complete, name);
      });
  }

  /**
   * 登録済みデバイス一覧を取得する
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.getRegisteredDevices = function(success, fail) {
    var self = this;
    self.debug('getRegisteredDevices start');

    var devices = self._getCachedDevices().filter(function(device) {
      return device.isRegistered();
    });
    var $queries = [];
    devices.forEach(function(cachedDevice, i) {
      $queries.push(self._attachDeviceInfo(cachedDevice, false));
    });
    $.when.apply($, $queries)
      .done(function() {
        self._callback(success, [devices]);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * LocalStorageに保存されているキャッシュ情報で更新する
   * 但し、一旦cacheDeviceとして読み出し済みのobject(使用中)は破棄できないので内容をマージする
   */
  Guardian.prototype.refreshCache = function(callback) {
    var self = this;
    // LocalStorageを読み直して別Activityから新規登録されているデバイスが無いか検索する
    $._storageRead(SKEY_LOCALKEY)
      .then(function(localKey) {
        var map = decode(localKey) || {};
        if (!Array.isArray(map.keys)) {
          return;
        }
        var replaceMap = false;
        var retainIds = [];
        for (var i = 0; i < map.keys.length; i++) {
          var device = self._parseCachedDevice(map.keys[i]);
          if (device) {
            var merge = self._findCachedDevice(device.getUniqueId());
            if (merge) {
              // 保存日が更新されている場合のみ内容をmerge
              if (merge.storeDate < device.storeDate) {
                replaceMap = true;
                $.extend(merge, device);
              }
            } else {
              replaceMap = true;
              self.__cachedDevices[device.getUniqueId()] = device;
            }
            retainIds.push(device.getUniqueId());
          }
        }
        // 削除されているデバイス情報は消す
        Object.keys(self.__cachedDevices).forEach(function(uniqueId) {
          if (retainIds.indexOf(uniqueId) < 0) {
            replaceMap = true;
            delete self.__cachedDevices[uniqueId];
          }
        });
        // デバイス数が変わっていたら差し替え
        if (!self.__localKeyMap || self.__localKeyMap.keys.length != map.keys.length) {
          replaceMap = true;
        }
        // 読み込み直したmap情報の方が新しい(更新されたデバイス情報がある)ので差し替える
        if (replaceMap) {
          self.debug('refreshCache() new map:', map);
          self.__localKeyMap = map;
        }
      })
      .always(function() {
        self._callback(callback);
      });
  }

  /**
   * サーバーに保存されている情報でデバイス表示情報(名前、アイコン)を更新する
   * 実行タイミングの制限を緩和するため登録状態等の利用可否に直接影響する変更はここでは行わない
   */
  Guardian.prototype.refreshFace = function(callback) {
    var self = this;
    var refreshDevices = [];
    // サーバから全デバイス情報を取得
    self._getDeviceListOnCloud()
      .then(function(deviceList) {
        deviceList.forEach(function(info) {
          var cachedDevice = self._findCachedDevice(info.jm1UniqueId);
          // ローカルに無い機器は無視
          if (!cachedDevice) {
            return;
          }
          var shifted = false;
          var userData = {};
          try {
            userData = JSON.parse(info.userData);
          } catch (e) {
            self.error('Invalid userData:', e);
          }
          var jm1 = {
             jm1UniqId: info.jm1UniqueId,
             productCode: userData.productCode
          };
          var device = self._createDevice(jm1);
          if (!device) {
            return;
          }
          device.setDeviceName(info.deviceName);
          device.setBackupData(userData);
          // デバイス名
          if (device.getDeviceName() !== cachedDevice.getDeviceName()) {
            cachedDevice.setDeviceName(device.getDeviceName());
            shifted = true;
          }
          // デバイスアイコン
          var deviceIcon = device.getDeviceIcon();
          var cachedIcon = cachedDevice.getDeviceIcon();
          if (deviceIcon || cachedIcon) {
            if (!deviceIcon || !cachedIcon || (deviceIcon.type != cachedIcon.type || deviceIcon.color != cachedIcon.color)) {
              cachedDevice.setDeviceIcon(deviceIcon);
              shifted = true;
            }
          }
          if (shifted) {
            refreshDevices.push(cachedDevice);
          }
        });
        if (refreshDevices.length) {
          return self._storeDeviceCache(refreshDevices);
        }
      })
      .done(function() {
        self._callback(callback, (0 < refreshDevices.length));
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(callback, false);
      });
  }

  /**
   * Guardianアカウントでログインする
   * @param {object} args
   * @param {string} args.username
   * @param {string} args.password
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.accountLogin = function(args, success, fail) {
    var self = this;
    var prevAccount;
    args = args || {};
    self._accountLogin(args.username, args.password)
      .then(function(response) {
        if (response.username) {
          // ログインに成功してもmigrateが完了するまでログイン情報は保存しない
          prevAccount = self.__loginAccount;
          self.__loginAccount = {
            username: response.username,
            token: response.sessionToken
          };
          return self._accountMigrate();
        } else {
          // ゲストログイン
          self.__loginAccount = {
            token: response.sessionToken
          };
        }
      })
      .then(function() {
        // アカウント情報を永続化
        return self._storeLoginState();
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        if (prevAccount) {
          self.__loginAccount = prevAccount;
        }
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * ログアウトする
   * ログイン中でない, ゲストユーザである等のログアウト不要な場合はエラーになる
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.prototype.accountLogout = function(success, fail) {
    var self = this;
    self._accountLogout()
      .then(function(response) {
        self.__loginAccount = {
          token: response.sessionToken
        };
        // ログアウトした登録機器情報を削除
        return $._storageRemove(SKEY_LOCALKEY);
      })
      .then(function() {
        // アカウント情報を永続化
        return self._storeLoginState();
      })
      .then(function() {
        return self._loadDeviceData();
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, [err, data]);
      });
  }

  /**
   * 現在のログインアカウントのユーザー名を返す
   * ゲストユーザーの場合は undefined
   * @returns {string}
   */
  Guardian.prototype.currentAccount = function() {
    if (this.__loginAccount) {
      return this.__loginAccount['username'];
    }
  }

  /**
   * 現在ログイン中かどうかを返す
   * ゲストユーザーログイン状態も含むため、通常ログアウトしてもログイン状態となる
   * 主に既存ユーザーとの区別を目的とする
   */
  Guardian.prototype.isLoggedIn = function() {
    return (this.__loginAccount && typeof(this.__loginAccount) == 'object' && this.__loginAccount.hasOwnProperty('token'));
  }

  Guardian.prototype.goAppSettingsScreen = function() {
    try {
      var settingsUrl = fixHubeaAppScrsByType(this.__serverType) + '/settings';
      hubea.system.activity.start({
        url: settingsUrl,
        //scenarioId: 0
      });
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Webリンク先のURLを取得する
   * @param link {Guardian.Link.*} Link識別子
   * @return {string} url
   */
  Guardian.prototype.getLinkUrl = function(link) {
    for (var key in Guardian.Link) {
      if (Guardian.Link[key] === link) {
        var anchor = document.createElement('a');
        anchor.href = link;
        return anchor.href + '?caller=app';
        //return this.__guardianServerUrl + '/' + link;
      }
    }
  }

  /**
   * 接続先hubeaサーバのタイプを返却する。
   * @return {string} hubeaサーバのタイプを示す1文字
   *                   - p: 本番サーバ
   *                   - f: Test Flight サーバ
   *                   - s: ステージングサーバ
   *                   - m: デモサーバ
   *                   - d: 開発サーバ
   *                   - l: ローカルサーバ
   */
  Guardian.prototype.getHubeaServerType = function() {
    return this.__serverType;
  }

  // private use
  Guardian.prototype._init = function(opts) {
    opts = opts || {};
    this.__jm1Types = opts.jm1Types || GUARDIAN_JM1_TYPES;
    this.__localKeyId = opts.localKeyId || GUARDIAN_LKEY_ID;
    this.__dataCommTimout = opts.dataCommTimout || 30000;
    this.__serverType = fixReplacementString(opts.serverType) || 'l';
    this.__hubeaServerUrl = fixReplacementString(opts.hubeaServerUrl) || fixHubeaServerByType(this.__serverType);
    this.__guardianServerUrl = fixReplacementString(opts.guardianServerUrl) || fixGuardianServerByType(this.__serverType);
    this.__bwgRelayServerUrl = fixReplacementString(opts.bwgRelayServerUrl) || fixBwgRelayServerByType(this.__serverType);
    this.__localKeyMap = {};
    this.__cachedDevices = {}; // key: uniqueId(UpperCase) ※localStorageから復元したものだけではない事に注意
    this.__installId;
    this.__userAgent;
    this.__loginAccount = {};
    this._initLog(opts.debug);
  }

  Guardian.prototype._createDevice = function(jm1) {
    var matchTypes = Guardian.DeviceModels.filter(function(deviceModel) {
      return (typeof window[deviceModel.model] == 'function' && deviceModel.productCodes &&  0 <= deviceModel.productCodes.indexOf(jm1.productCode));
    });
    if (0 < matchTypes.length) {
      var device = new window[matchTypes[0].model](this, jm1);
      device.jm1Type = matchTypes[0].jm1Type;
      return device;
    }
  }

  Guardian.prototype._attachDeviceInfo = function(device, checkServer) {
    var self = this;
    var $dfd = $.Deferred();

    // デバイスIDの取得
    var args = {};
    if (device.jm1 && device.jm1.serviceUuid) {
      // serviceUuidがある場合はそれを優先的に使用する(オフラインでも利用可能)
      args.serviceUuid = device.jm1.serviceUuid;
      args.type = device.jm1Type;
    } else
    if (device.deviceHandle) {
      // deviceHandle値がある場合はそれを使用する(オンライン必須)
      args.deviceHandle = device.deviceHandle;
    } else {
      // 不正情報デバイス
      $dfd.resolve();
      return;
    }
    // デバイスIDが無ければ取得
    var $d;
    if (!device.deviceId) {
      $d = $._getDevice(args).then(null, function() {
        if (args.deviceHandle) {
          self.debug('_attachDeviceInfo unexpected device handle.');
          return $.Deferred().resolve().promise();
        }
      });
    } else {
      $d = $.Deferred().resolve(device.deviceId);
    }
    $d.then(function(deviceId) {
      self.debug('_attachDeviceInfo deviceId=' + deviceId);
      if (deviceId) {
        device.deviceId = deviceId;
        // デバイスハンドルが無ければ取得
        if (!device.deviceHandle) {
          return $._getDeviceHandle({deviceId: deviceId});
        }
      }
      return device.deviceHandle;
    }).then(function(deviceHandle) {
      if (deviceHandle != -1) {
        self.debug('_attachDeviceInfo deviceHandle=' + deviceHandle);
        device.deviceHandle = deviceHandle;
      }
      if (!checkServer) {
        // サーバー情報が不要な場合は以降をskip
        return;
      }
      // プロダクト名を取得
      return self._getJm1ProductName(device.jm1.productCode);
    }).then(function(productName) {
      if (!checkServer) {
        // サーバー情報が不要な場合は以降をskip
        return;
      }
      self.debug('_attachDeviceInfo productName=' + productName);
      device.productName = productName;
      var $queries = [];
      // 登録済みのデバイス名があれば取得
      $queries.push(self._getRegisteredDeviceName(device.getUniqueId())
        .then(function(response) {
          self.debug('_getRegisteredDeviceName:', response);
          if (response.deviceName) {
            device.deviceName = response.deviceName;
          }
          if (response.imageUrl) {
            device.deviceImage = response.imageUrl;
          }
        })
      );
      return $.when.apply($, $queries);
    }).done(function() {
      $dfd.resolve();
    }).fail(function(err, data) {
      $dfd.reject(err, data);
    });

    return $dfd.promise();
  }

  /**
   * キャッシュされているデバイスを取得する
   * 指定されたuniqueIdに対応するデバイスがキャッシュされていない場合はundefinedを返却する
   * 返却されるデバイスにはまだdeviceIdが付与されていないので利用前にattachすること
   * @param {string} uniqueId
   * @return
   */
  Guardian.prototype._findCachedDevice = function(uniqueId) {
    if (typeof uniqueId == 'string') {
      return this.__cachedDevices[uniqueId.toUpperCase()];
    } else
    if (typeof uniqueId == 'number') {
      return this.__cachedDevices[('0000000'+ uniqueId.toString(16)).slice(-8).toUpperCase()];
    }
  }

  Guardian.prototype._getCachedDevices = function() {
    var self = this;
    var devices = [];
    Object.keys(self.__cachedDevices).forEach(function(uniqueId) {
      devices.push(self.__cachedDevices[uniqueId]);
    });
    return devices;
  }

  /*
   * キャッシュされているデバイスを全て復元する
   */
  Guardian.prototype._createCachedDevices = function() {
    var devices = [];
    if (this.__localKeyMap.keys) {
      for (var i = 0; i < this.__localKeyMap.keys.length; i++) {
        var device = this._parseCachedDevice(this.__localKeyMap.keys[i]);
        if (device) {
          devices.push(device);
        }
      }
    }
    return devices;
  }

  // コンテンツサーバからデバイス情報を復元する
  // サーバーからデータが得られなかった場合は、ローカルストレージからキャッシュしたデバイス情報を復元する
  Guardian.prototype._loadDeviceData = function() {
    var self = this;
    this.debug('_loadDeviceData >>>');

    var decoder = function(localKey) {
      if (localKey) {
        self.__localKeyMap = decode(localKey) || {};
        // device一覧を復元
        var cachedDevices = self._createCachedDevices();
        self.__cachedDevices = {};
        for (var i = 0; i < cachedDevices.length; i++) {
          self.__cachedDevices[cachedDevices[i].getUniqueId()] = cachedDevices[i];
        }
        self.debug('_loadDeviceData: cached devices:', self.__cachedDevices);
        return $._resolveAction();
      }
      self.__localKeyMap  = {};
      self.__cachedDevices = {};
      return $._rejectAction();
    };

    return $.Deferred(function($dfd) {
      // mergeするデータがあるのでローカルデータを先読みする
      $._storageRead(SKEY_LOCALKEY)
        .then(function(localKey) {
          // このdecodeは(インストール直後等、データが無い場合があるので)失敗しても良い
          decoder(localKey);
          // サーバー上のデータから復元する
          return self._recoverDevicesData(decoder)
            .then(null, function() {
              // failed fallback
              self.debug('_loadDeviceData: failed to recover server data');
              // サーバー上のデータが確認できない状態では既に保存されているキャッシュがある場合のみ継続可能
              return decoder(localKey);
            });
        })
        .done(function() {
          self.debug('_loadDeviceData <<<');
          $dfd.resolve();
        })
        .fail(function(err, data) {
          self.error('_loadDeviceData: failed');
          $dfd.reject(err, data);
        });
      });
  }

  /**
   * LocalStorageから読み出したデバイス情報をDeviceオブジェクトへ変換する
   * 変換できなかった場合は undefined を返す
   */
  Guardian.prototype._parseCachedDevice = function(dataSet) {
    var jm1 = {
      productCode: dataSet.productCode
    };
    var device = this._createDevice(jm1);
    if (device) {
      // デバイス間通信を行う機器の場合
      // deviceHandle、uniqueIdが無いものは復元できない(_storeDeviceCacheと条件を合わせる)
      device.uniqueId = dataSet.id;
      device.deviceHandle = dataSet.handle;
      device.localKey = dataSet.key;
      device.productName = dataSet.productName;
      device.deviceImage = dataSet.deviceImage;
      device.deviceIcon = dataSet.deviceIcon;
      device.pinCode = dataSet.pin;
      device.wifiAccessible = dataSet.wifiAccessible;
      device.config = dataSet.config;
      device.type = dataSet.type;
      device.isRegisteredDevice = dataSet.registered;
      if (dataSet.date) {
        device.storeDate = new Date(dataSet.date);
      }
      try {
        device.deviceName = hubea.util.base64ToText(dataSet.deviceName);
      } catch (e) {
        device.deviceName = dataSet.deviceName;
      }
    } else {
      this.warn('productCode=' + dataSet.productCode + ' is unknown device.');
    }
    return device;
  }

  // ローカルストレージからキャッシュしたログイン情報を復元する
  // この情報はサーバーに保存されない(アプリケーション削除とともに消える)
  Guardian.prototype._loadLoginState = function() {
    var self = this;
    return $._storageRead(SKEY_ACCOUNT)
      .done(function(account) {
        self.__loginAccount = decode(account) || {};
      });
  }

  Guardian.prototype._storeLoginState = function() {
    // Session情報に発行した時のinstallIdをバンドルする
    if ($.isPlainObject(this.__loginAccount)) {
      this.__loginAccount.installId = this.__installId;
    }
    return $._storageSave(SKEY_ACCOUNT, encode(this.__loginAccount));
  }

  Guardian.prototype._clearLoginState = function() {
    var self = this;
    return $._storageRemove(SKEY_ACCOUNT)
      .done(function() {
        self.__loginAccount = {};
      });
  }

  //************************************************************************//
  // Guardianサーバ API
  //************************************************************************//

  Guardian.prototype._registerDeviceOnCloud = function(device) {
    if (device instanceof Purifier) {
      return this._registerPurifierOnCloud(device);
    }
    if (device instanceof BwGateway) {
      return this._registerBwGatewayOnCloud(device);
    }
    return $._rejectAction();
  }

  /**
   * 空気清浄機デバイスの登録
   * @param {Purifier} device
   * @return Deferred
   */
  Guardian.prototype._registerPurifierOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    // サーバーが解釈しないバックアップデータ
    var userData = device.getBackupData();
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
      deviceName : device._edit('deviceName') || device.getDeviceName(),
      localKey: device.localKey,
      userData: JSON.stringify(userData)
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/devices/regist', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_registerPurifierOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * BLE/WiFi Gatewayの登録
   * @param {BwGateway} device
   * @return Deferred
   */
  Guardian.prototype._registerBwGatewayOnCloud = function(device) {
    if (!(device instanceof BwGateway)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      bwgUniqueId: device.getUniqueId(),
      localKey: device.localKey,
      jm1UniqueId: device.getTargetJm1UniqueId(),
      wifiAccessCode: device.getPinCode()
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/gateways/regist', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_registerBwGatewayOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * WiFiの利用可否チェック
   * @param {Purifier} device
   * @param {string} pin
   * @return Deferred
   */
  Guardian.prototype._checkWifiAccessCodeOnCloud = function(device, pin) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
      wifiAccessCode: pin
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/devices/checkCode', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_checkWifiAccessCodeOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * 空気清浄機デバイスの登録
   * @param {Purifier} device
   * @return Deferred
   */
  Guardian.prototype._unregisterDeviceOnCloud = function(device) {
    if (device instanceof BwGateway) {
      // Gateway自身のサーバー登録解除は無い
      return $.Deferred().resolve().promise();
    }
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId()
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/devices/delete', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_unregisterDeviceOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * 空気清浄機デバイスのリセット
   * リセットとは以下を含むため他のユーザーにも伝搬する
   * - デバイスと installId との紐付けを全て解除する
   * - デバイスに対するユーザ固有のデータを全て解除する
   * - デバイスに対する Wi-Fi アクセス権限を全て解除する
   * - デバイスにGatewayの設定があれば削除する。中継サーバの設定も削除する
   *
   * @param {Purifier} device
   * @return Deferred
   */
  Guardian.prototype._resetDeviceOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId()
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/devices/reset', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_resetDeviceOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * 空気清浄機デバイスの情報更新
   * @param {Purifier} device
   * @return Deferred
   */
  Guardian.prototype._updateDeviceOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var userData = device.getBackupData();
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
      deviceName : device._edit('deviceName') || device.getDeviceName(),
      userData: JSON.stringify(userData)
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/device_configs/set', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve();
          } else {
            self.error('_updateDeviceOnCloud:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * @param {Guardian.Device} device
   * @return
   */
  Guardian.prototype._connectOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/connect', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve();
          } else {
            if (response.result == Guardian.ErrorTypes.GS_INVALID_PIN) {
              // PINが無効になっている
              device.setPinCode(null);
              device.updateDevice();
            }
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
      });
  }

  /**
   * @param {Guardian.Device} device
   * @return
   */
  Guardian.prototype._disconnectOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/disconnect', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve();
          } else {
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
      });
  }

  Guardian.prototype._getStatusOnCloud = function(device) {
    if (!(device instanceof Purifier)) {
      return $._rejectAction();
    }
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/status', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            if (!response.isConnected) {
              $dfd.reject(Guardian.ErrorTypes.GS_NO_CONNECABLE_BWG);
              return;
            }
            // ASPEのレスポンスがそのまま入ってくる
            try {
              var message = self.fetchMessage(hubea.util.base64ToArray(response.status));
              var status = device._parseDeviceSettingReport(message);
              self.log('status:', status);
              $dfd.resolve(status);
              return;
            } catch (e) {
              self.error('_getStatusOnCloud():', e);
            }
            $dfd.reject();
          } else {
            $dfd.reject(response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * @param {Guardian.Device} device
   * @param {ASPEMessage} message
   * @return
   */
  Guardian.prototype._sendMessageToCloud = function(device, message) {
    var self = this;
    var args = {
      installId: this.__installId,
      jm1UniqueId: device.getUniqueId(),
      command: hubea.util.toBase64(message.getData()),
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/command', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve();
          } else {
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
      });
  }

  /**
   * サーバー上の登録済みデバイス一覧を取得する
   */
  Guardian.prototype._getDeviceListOnCloud = function() {
    var self = this;
    var args = {
      installId: this.__installId
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/devices/list', 'POST', args, CONTENTS_SERVER_SIGNATURE)
      .then(function(response) {
        self.trace('response:', response);
        if (response.result === 0) {
          $dfd.resolve(response.devices);
        } else {
          $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
        }
      })
      .fail(function(err, data) {
        $dfd.reject(err, data);
      });
    });
  }

  // デバイス情報のリカバリ処理
  Guardian.prototype._recoverDevicesData = function(decoder) {
    var self = this;
    return $.Deferred(function($dfd) {
      var devices = [];
      // サーバから全デバイス情報を取得
      self._getDeviceListOnCloud()
        .then(function(deviceList) {
          deviceList.forEach(function(info) {
            var userData = {};
            try {
              userData = JSON.parse(info.userData);
            } catch (e) {
              self.error('Invalid userData:', e);
            }
            // Deviceオブジェクトを生成
            // productCodeはuserDataに紛れているので個別に参照する
            var jm1 = {
               jm1UniqId: info.jm1UniqueId,
               productCode: userData.productCode
            };
            var device = self._createDevice(jm1);
            if (device) {
              device.setDeviceName(info.deviceName);
              device.setWifiAccessible(info.wifiAccessible);
              device.setBackupData(userData);
              device.isRegisteredDevice = true;
              // deviceHandleは(互換性が無いので)localデータを優先する
              var cacheDevice = self._findCachedDevice(info.jm1UniqueId);
              if (cacheDevice && cacheDevice.deviceHandle) {
                device.deviceHandle = cacheDevice.deviceHandle;
              }
              devices.push(device);
            }
          });
          // ローカルストレージに保存
          return self._storeDeviceCache(devices);
        })
        .then(function() {
          // 正しく書き込めたかチェック
          return $._storageRead(SKEY_LOCALKEY);
        })
        .then(function(localKey) {
          return decoder(localKey);
        })
        .done(function() {
          self.warn('Recovery: success');
          $dfd.resolve(devices);
        })
        .fail(function(err, data) {
          self.error('Recovery: failed');
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * ユーザアカウントによるログイン(Amazon Echo)
   * @param username: ユーザー名またはemailアドレス
   * @param password
   * @returns
   */
  Guardian.prototype._accountLogin = function(username, password) {
    var self = this;
    var args = {
      installId: this.__installId
    };
    if (username && password) {
      args.username = username;
      args.password = password;
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/users/login', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('_accountLogin:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * ユーザーアカウントのデータを移行する
   * ゲストアカウントから、正規アカウントへのlogin直後に都度実施する
   * 成功すると、ゲストアカウントの登録機器情報は全て削除される
   */
  Guardian.prototype._accountMigrate = function() {
    var self = this;
    var args = {
      installId: this.__installId
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/users/migrate', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            // サーバー情報機器情報が削除されたのでキャッシュも全削除
            return $._storageRemove(SKEY_LOCALKEY);
          } else {
            self.error('_accountLogin:' + response.result);
            return $._rejectAction(Guardian.ErrorTypes.CS_ERROR, response.result);
          }
        })
        .then(function() {
          return self._loadDeviceData();
        })
        .done(function() {
          $dfd.resolve();
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * ログアウト
   */
  Guardian.prototype._accountLogout = function() {
    var self = this;
    var args = {
      installId: this.__installId
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/users/logout', 'POST', args, CONTENTS_SERVER_SIGNATURE)
        .then(function(response) {
          if (response.result === 0) {
            return response;
          } else {
            self.error('_accountLogout:' + response.result);
            return $._rejectAction(Guardian.ErrorTypes.CS_ERROR, response.result)
          }
        })
        .done(function(response) {
          $dfd.resolve(response);
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * BwGatewayのメタデータ更新
   * @param {BwGateway} device
   * @param {object} properties (KV)
   * @return Deferred
   */
  Guardian.prototype._setBwGatewayMetaData = function(device, properties) {
    if (!(device instanceof BwGateway)) {
      return $._rejectAction();
    }
    var self = this;
    var path = '/api/gateways/' + device.getUniqueId() + '/metadata.json';
    var metadata = [];
    Object.keys(properties).forEach(function(key) {
      metadata.push({
        key: key,
        value: properties[key]
      });
    });
    return $.Deferred(function($dfd) {
      self._doAuthReq(path, 'POST', {metadata: metadata}, BWG_RELAY_SERVER_SIGNATURE)
        .then(function(response) {
          $dfd.resolve();
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  //************************************************************************//
  //  hubeaサーバ API
  //************************************************************************//

  Guardian.prototype._getJm1ProductName = function(productCode) {
    var self = this;
    var data = {
      installId: this.__installId,
      jm1ProductCode: productCode
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/jm1s/get_product_name', 'POST', data)
        .then(function(response) {
          if (response.result === 0) {
            // プロダクト画像はコンテンツ内部で（デザインされたものを）持つので
            // ここでは名前のみ返す
            $dfd.resolve(response.productName);
          } else {
            self.error('getJm1ProductName:' + response.result);
            //$dfd.reject(Guardian.ErrorTypes.HS_ERROR, response.result);
            $dfd.resolve(); // 登録時に困るかも
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  Guardian.prototype._getRegisteredDeviceName = function(uniqueId) {
    var self = this;
    var data = {
      uniqueId: uniqueId
    };
    return $.Deferred(function($dfd) {
      self.log('_getRegisteredDeviceName:', data);
      self._doAuthReq('/jm1s/get_registered_device_name', 'POST', data)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response);
          } else {
            self.error('getRegisteredDeviceName:' + response.result);
            //$dfd.reject(Guardian.ErrorTypes.HS_ERROR, response.result);
            $dfd.resolve({});
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  Guardian.prototype._registerDeviceName = function(device) {
    var self = this;
    //imageDataは画像のバイナリデータをbase64エンコードしたもの。
    //JavaScriptで画像のバイナリデータが取得できない場合は、WebAPIを変更したいと思います。
    //jsonをPOSTするのではなく、FormDataオブジェクトを使って'application/x-www-form-urlencoded'でPOSTする。

    //イメージだけ更新する。名前だけまたは両方を更新する。ときは /jm1s/update_device_name を使用してください。
    var imageData;
    var deviceImage = device._edit('deviceImage');;
    if (deviceImage && deviceImage.lastIndexOf('data:image/', 0) == 0) {
      var pos = deviceImage.indexOf(';base64,');
      if (0 < pos) {
        imageData = deviceImage.substring(pos + 8);
      }
    }

    var data = {
      uniqueId: device.getUniqueId(),
      deviceName: device._edit('deviceName'),
      imageData: imageData
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/jm1s/register_device_name', 'POST', data)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve();
          } else {
            self.error('registerDeviceName:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.HS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  Guardian.prototype._updateDeviceName = function(device) {
    var self = this;
    // registerDeviceとほぼ同じ

    return $.Deferred(function($dfd) {
      if (!device.edit) {
        self.debug('_updateDeviceName no edit data.');
        $dfd.resolve(false);
        return;
      }
      /* skip */
      $dfd.resolve(true);
      return;

      // 編集中の情報だけ選択的にアップロードする
      var imageData;
      var editImage = device.edit.deviceImage;
      if (editImage && editImage.lastIndexOf('data:image/', 0) == 0) {
        var pos = editImage.indexOf(';base64,');
        if (0 < pos) {
          imageData = editImage.substring(pos + 8);
        }
      }
      if (!device.edit.deviceName && !imageData) {
        $dfd.resolve(false);
        return;
      }
      var data = { uniqueId: device.getUniqueId() };
      if (device.edit.deviceName) data['deviceName'] = device.edit.deviceName;
      if (imageData) data['imageData'] = imageData;

      var data = {
        uniqueId: device.getUniqueId(),
        deviceName: device.edit.deviceName,
        deviceImage: imageData
      };
      self._doAuthReq('/jm1s/update_device_name', 'POST', data)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(true);
          } else {
            self.error('_updateDeviceName:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.HS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  Guardian.prototype._searchDeviceName = function(keyword) {
    var self = this;
    var data = {
      keyWord: keyword
    };
    return $.Deferred(function($dfd) {
      self._doAuthReq('/jm1s/search_registered_device_names', 'POST', data)
        .then(function(response) {
          if (response.result === 0) {
            $dfd.resolve(response.deviceNames);
          } else {
            self.error('_searchDeviceName:' + response.result);
            $dfd.reject(Guardian.ErrorTypes.HS_ERROR, response.result);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  Guardian.prototype._resolveAuthHeader = function(path, method, contType, md5, contentService) {
    var self = this;
    var $dfd = $.Deferred();
    var args = {
      httpVerb: method,
      contentMd5: md5,
      contentType: contType,
      path: path
    }
    if (contentService) {
      args['contentService'] = contentService;
    }
    self.debug(args);
    try {
      hubea.security.createAuthHeaders(args,
        function(result) {
          var headers = result.headers || {};
          // [Guardian Server Spec]
          if (contentService === CONTENTS_SERVER_SIGNATURE) {
            if (typeof(self.__loginAccount) == 'object' && self.__loginAccount.hasOwnProperty('token')) {
              headers['x-guardian-auth'] = self.__loginAccount['token'];
            }
          }
          $dfd.resolve(headers);
        },
        function() {
          $dfd.reject();
        }
      );
    } catch (e) {
      //through
      $dfd.resolve();
    }
    return $dfd.promise();
  }

  Guardian.prototype._doAuthReq = function(path, method, data, contentService) {
    var self = this;
    var server = self.__hubeaServerUrl;
    if (contentService == CONTENTS_SERVER_SIGNATURE) {
      server = self.__guardianServerUrl;
    } else
    if (contentService == BWG_RELAY_SERVER_SIGNATURE) {
      server = self.__bwgRelayServerUrl;
    }
    method = (method || 'get').toUpperCase();
    data = $.extend(data || {}, {
      userAgent: self.__userAgent,
      hs: self.getHubeaServerType()
    });
    var json = JSON.stringify(data);
    var contentType = '';
    var md5 = ''; // if need(default blank).
    self.trace(json);
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
      self._resolveAuthHeader(path, method, contentType, md5, contentService)
        .then(function(headers) {
          return $.ajax({
            url: server + path,
            type: method,
            contentType: contentType,
            dataType: 'json',
            data: data,
            cache: true,
            timeout: 10000,
            beforeSend: function(xhr, settings) {
              if (settings.type == 'POST' && 0 < md5.length) {
                xhr.setRequestHeader('Content-MD5', md5);
              }
              if (headers) {
                Object.keys(headers).forEach(function(key, i) {
                  self.debug('x-header name:[' + key + '] value:[' + headers[key] + ']');
                  xhr.setRequestHeader(key, headers[key]);
                });
              }
            },
            success : $dfd.resolve
          });
        }, function() {
          $dfd.reject(Guardian.ErrorTypes.HUBEA_JS_ERROR);
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
          var args = {
            jqXHR: jqXHR,
            textStatus: textStatus,
            errorThrown: errorThrown
          };
          $dfd.reject(Guardian.ErrorTypes.AJAX_ERROR, args);
        });
    });
  }

  Guardian.prototype._storeDeviceCache = function(devices) {
    var self = this;
    if (!devices) {
      return $._rejectAction();
    }
    if (devices instanceof Guardian.Device) {
      devices = [devices];
    }

    var keyset = this.__localKeyMap.keys || [];
    var now = new Date();
    devices.forEach(function(device) {
      var productCode;
      var append = true;
      if (device.jm1) {
        productCode = device.jm1.productCode;
      }
      keyset.forEach(function(set, i) {
        if (set.id === device.getUniqueId()) {
          set.handle = device.deviceHandle;
          set.key = device.localKey;
          set.productCode = productCode;
          set.productName = device.productName;
          set.deviceName = device.deviceName;
          set.deviceImage = device.deviceImage;
          set.deviceIcon = device.getDeviceIcon();
          set.pin = device.getPinCode();
          set.wifiAccessible = device.getWifiAccessible();
          set.config = device.config;
          set.type = device.type;
          set.registered = device.isRegisteredDevice;
          set.date = now.getTime();
          append = false;
        }
      });
      if (append) {
        var element = {
          id: device.getUniqueId(),
          handle: device.deviceHandle,
          key: device.localKey,
          productCode: productCode,
          productName: device.productName,
          deviceName: device.deviceName,
          deviceImage: device.deviceImage,
          deviceIcon: device.getDeviceIcon(),
          pin: device.getPinCode(),
          wifiAccessible: device.getWifiAccessible(),
          config: device.config,
          type: device.type,
          registered: device.isRegisteredDevice,
          date: now.getTime()
        };
        keyset.push(element);
      }
      device.storeDate = now;
      self.__cachedDevices[device.getUniqueId()] = device;
    });
    this.__localKeyMap.keys = keyset;
    return $._storageSave(SKEY_LOCALKEY, encode(this.__localKeyMap));
  }

  Guardian.prototype._clearDeviceCache = function(uniqueId) {
    var self = this;
    if (!uniqueId) {
      return;
    } else if (typeof uniqueId == 'string') {
      uniqueId = uniqueId.toUpperCase();
    } else if (typeof uniqueId == 'number') {
      uniqueId = ('0000000'+ uniqueId.toString(16)).slice(-8).toUpperCase();
    } else {
      return;
    }
    var keyset = this.__localKeyMap.keys || [];
    keyset = keyset.filter(function(set, i) {
      return set.id != uniqueId;
    });
    delete this.__cachedDevices[uniqueId];
    this.__localKeyMap.date = new Date().getTime();
    this.__localKeyMap.keys = keyset;
    return $._storageSave(SKEY_LOCALKEY, encode(this.__localKeyMap));
  }

  Guardian.prototype._callback = function(func, args) {
    var self = this;
    if (!$.isArray(args)) {
      args = [args];
    }
    if (typeof func === 'function') {
      setTimeout(function() {
        func.apply(self, args);
      }, 0);
    } else {
      self.warn('_callback(): func is not function.');
    }
  }

  Guardian.prototype._initLog = function(debug) {
    var self = this;
    var level = debug || 0;
    if (window.console === 'undefined') {
      window.console = {};
    }
    var methods = [
        'error',
        'warn',
        'info',
        'log',
        'debug',
        'trace',
    ];
    for (var i in methods) {
      (function(m) {
        if (i <= level && typeof console[m] === 'function') {
          self[m] = console[m].bind(console);
        } else {
          self[m] = function(){}
        }
      })(methods[i]);
    }
    /*
    // check
    self.error('this is error message.');
    self.warn('this is warn message.');
    self.info('this is info message.');
    self.log('this is log message.');
    self.debug('this is debug message.');
    self.trace('this is trace message.');
    */
  }

  /**
   * JM1デバイス情報をラップする共通オブジェクト
   */
  Guardian.Device = function(guardian, jm1) {
    if (this instanceof Guardian.Device) {
      this.guardian = guardian;
      this.jm1 = jm1;
      this.uniqueId;
      this.deviceId;
      this.deviceHandle;
      this.productName;
      this.deviceName;
      this.deviceImage;  // url or data:*(img.srcにそのまま突っ込める形式)
      this.deviceIcon;   // object(プリセットアイコン属性情報)
      this.config;       // object(hubeaに依存しないデバイス由来の永続化情報)
      this.localKey;
      this.isRegisteredDevice; // <-- guardianサーバー登録済みかどうか(オンライン前提)
      this.comm;         // <-- startCommunication中のリソース
      this.pinCode;      // WiFi access code;
      this.wifiAccessible;

      var silence = function(){};
      this.error = guardian ? guardian.error : silence;
      this.warn  = guardian ? guardian.warn : silence;
      this.info  = guardian ? guardian.info : silence;
      this.log   = guardian ? guardian.log  : silence;
      this.debug = guardian ? guardian.debug : silence;
      this.trace = guardian ? guardian.trace : silence;

      return this;
    }
    return new Guardian.Device(jm1);
  }

  Guardian.Device.prototype.equals = function(device) {
    if (device && device.uniqueId) {
      return (device.uniqueId == this.uniqueId);
    }
    return false;
  }

  Guardian.Device.prototype.getUniqueId = function() {
    if (this.uniqueId) {
      return this.uniqueId;
    }
    if (this.jm1) {
      if (this.jm1.serviceUuid) {
        this.uniqueId = uniqueIdFromUuid(this.jm1.serviceUuid);
      } else if (this.jm1.jm1UniqId) {
        this.uniqueId = this.jm1.jm1UniqId;
      }
    }
    return this.uniqueId;
  }

  Guardian.Device.prototype.getProductName = function() {
    return this.productName;
  }

  Guardian.Device.prototype.getDeviceName = function() {
    return this.deviceName;
  }

  Guardian.Device.prototype.setDeviceName = function(deviceName) {
    this.deviceName = deviceName;
  }

  Guardian.Device.prototype.getDeviceImage = function() {
    return this.deviceImage;
  }

  Guardian.Device.prototype.setDeviceImage = function(image) {
    this.deviceImage = image;
  }

  Guardian.Device.prototype.getDeviceIcon = function() {
    return this.deviceIcon;
  }

  Guardian.Device.prototype.setDeviceIcon = function(icon) {
    this.deviceIcon = icon;
  }

  Guardian.Device.prototype.setPinCode = function(code) {
    this.pinCode = code;
  }

  Guardian.Device.prototype.getPinCode = function() {
    return this.pinCode;
  }

  Guardian.Device.prototype.setWifiAccessible = function(accessible) {
    this.wifiAccessible = accessible;
  }

  Guardian.Device.prototype.getWifiAccessible = function() {
    // 旧データ用
    if (typeof(this.wifiAccessible) === 'undefined') {
      return (typeof(this.pinCode) === 'string' && this.pinCode.length);
    } else {
      return (this.wifiAccessible ? true : false);
    }
  }

  /**
   * サーバーに保存するデバイス情報(復元に必要な情報)を取得する
   */
  Guardian.Device.prototype.getBackupData = function() {
    var data = {
      handle     : this.deviceHandle,
      key        : this.localKey,
      productName: this.getProductName(),
      icon       : this._edit('deviceIcon') || this.getDeviceIcon(),
      pinCode    : this.getPinCode()
    };
    if (this.jm1) {
      data.serviceUuid = this.jm1.serviceUuid;
      data.productCode = this.jm1.productCode;
    }
    return data;
  }

  /**
   * サーバーから取得したデバイス情報(復元に必要な情報)を反映する
   */
  Guardian.Device.prototype.setBackupData = function(data) {
    if (!data) {
      return;
    }
    this.deviceHandle = data.handle;
    this.localKey     = data.key;
    this.productName  = data.productName;
    this.deviceIcon   = data.icon;
    this.pinCode      = data.pinCode;
    if (this.jm1) {
      this.jm1.serviceUuid = data.serviceUuid;
      this.jm1.productCode = data.productCode;
    }
  }

  /**
   * デバイスの一時的な編集処理を開始する
   */
  Guardian.Device.prototype.editStart = function() {
    this._rollback();
    return this;
  }

  Guardian.Device.prototype.editDeviceName = function(deviceName) {
    this._edit('deviceName', deviceName);
    return this;
  }

  Guardian.Device.prototype.editDeviceImage = function(deviceImage) {
    this._edit('deviceImage', deviceImage);
    return this;
  }

  Guardian.Device.prototype.editDeviceIcon = function(deviceIcon) {
    this._edit('deviceIcon', deviceIcon);
    return this;
  }

  /**
   * タッチ発火を抑止する
   * 呼び出し元の画面がフォアグラウンドの間だけ有効
   * @param timeout:number 抑止期間(未指定の場合デフォルトで1 minute)
   */
  Guardian.Device.prototype.disableTouch = function(timeout, success, fail) {
    var self = this;
    var args = {
      jm1UniqId: self.getUniqueId(),
      time: timeout || 60000
    };
    self.debug('disableTouch:' + self.getUniqueId());
    try {
      hubea.jm1.pauseDeviceTouchEvent(args,
        function() {
          self._callback(success);
        },
        function(err) {
          self._callback(fail, Guardian.ErrorTypes.HUBEA_JS_ERROR);
        }
      );
    } catch (e) {
      self.error('hubea.jm1.pauseDeviceTouchEvent', e);
      self._callback(fail, Guardian.ErrorTypes.UNKNOWN);
    }
  }

  /**
   * デバイス依存の設定情報を設定/取得する
   * ここに格納した値はLocalStorage保存対象となる(設定した瞬間に反映されるわけではない)
   */
  Guardian.Device.prototype._config = function(/* name [, value ] */) {
    var argLen = arguments.length;
    if (argLen == 1) {
      // get
      if (this.config) {
        var value = this.config[arguments[0]];
        if (value instanceof Object) {
          // 元データが直接上書きされないようにコピー
          return $.extend(true, {}, value);
        }
        return value;
      }
    } else
    if (1 < argLen) {
      // set
      var config = this.config || {};
      config[arguments[0]] = arguments[1];
      this.config = config;
    }
  }

  /**
   * デバイスの一時的な編集情報を設定/取得する
   */
  Guardian.Device.prototype._edit = function(/* name [, value ] */) {
    var argLen = arguments.length;
    if (argLen == 1) {
      // get
      if (this.edit) {
        return this.edit[arguments[0]];
      }
    } else
    if (1 < argLen) {
      // set
      var edit = this.edit || {};
      edit[arguments[0]] = arguments[1];
      this.edit = edit;
    }
  }

  /**
   * デバイスの一時的な編集情報を反映する
   */
  Guardian.Device.prototype._commit = function() {
    if (this.edit) {
      for (var key in this.edit) {
        if (key != 'edit' && this.edit.hasOwnProperty(key)) {
          this[key] = this.edit[key];
        }
      }
    }
  }

  /**
   * デバイスの一時的な編集情報を破棄する
   */
  Guardian.Device.prototype._rollback = function() {
    delete this.edit;
  }

  Guardian.Device.prototype.isRegistered = function() {
    // Guardianの場合、LocalKeyは不要
    return this.isRegisteredDevice ? true : false;
  }

  Guardian.Device.prototype.inCommunication = function() {
    return this.comm ? true : false;
  }

  Guardian.Device.prototype.inCommunicationWithLocalKey = function() {
    return this.comm ? (this.comm.withLocalKey ? true : false) : false;
  }

  Guardian.Device.prototype.isSwitchCommunicationSupported = function() {
    return true; //default (F/W v3.0)    
  }

  Guardian.Device.prototype.inSession = function() {
    return this.comm && this.comm.session ? true : false;
  }

  Guardian.Device.prototype.release = function(complete) {
    if (typeof complete !== 'function') {
      complete = function(){};
    }
    if (!this.deviceId) {
      complete.apply(null, [true]);
      return;
    }
    var self = this;
    $._releaseDevice({deviceId: this.deviceId})
      .done(function() {
        self.deviceId = null;
        complete.apply(null, [true]);
      })
      .fail(function() {
        complete.apply(null, [false]);
      });
  }

  /**
   * デバイスに接続し、inRange状態になるのを待つ
   * この処理に成功すると指定されたデバイスは接続状態になるが
   * データ通信には使用できないので注意すること(デバイス登録操作用)
   * 必要な操作が終了したら必ずstopCommunicationを呼び出して接続を終了させること
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.Device.prototype.startCommunication = function(success, fail) {
    var self = this;

    // データ通信中は拒否
    if (self.inSession()) {
      self.warn('startCommunication uniqueId:%s in session now.', self.getUniqueId());
      self._callback(fail, Guardian.ErrorTypes.CONNECTION_BUSY);
      return;
    }
    var args = {};
    var errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
    // JM1デバイス接続
    self._ensureDeviceId()
      .then(function() {
        args.deviceId = self.deviceId;
        // 切断処理中であれば待ち合わせ
        return self._waitCommunicationCriticalSection();
      })
      .then(function() {
        if (self.inCommunication()) {
          return self._switchCommunicationWithLocalKey(false);
        }
        return $._startCommunication(args).then(function() {
          self.comm = {
            withLocalKey: false
          };
        });
      })
      .then(function() {
        // inRange状態待ち合わせ
        errorVal = Guardian.ErrorTypes.INRANGE_TIMEOUT;
        return $._waitInRange(args, self._getInRangeTimeout());
      })
      .done(function() {
        self.debug('Communication inRange.');
        self._callback(success);
      })
      .fail(function(err) {
        if (!err) {
          err = errorVal;
        }
        self.error('startCommunication uniqueId:%s failed:%s', self.getUniqueId(), err);
        self._releaseCommunication()
          .always(function() {
            self._callback(fail, err);
          });
      });
  }

  /**
   * デバイスとの接続を終了する
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.Device.prototype.stopCommunication = function(success, fail) {
    var self = this;
    self._releaseCommunication()
      .done(function() {
        self._callback(success);
      })
      .fail(function(err) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        self.error(err);
        self._callback(fail, err);
      });
  }

  /**
   * デバイス登録処理を行う
   * この処理ではデバイスへの接続開始処理は行わないため、startCommunication()実行後に呼び出すこと。
   * 登録処理は以下の３つに分類される
   * (1) JM1へのLocalKey登録
   * (2) guardianサーバーへのデバイス登録
   * (3) hubeaサーバーへのデバイス名登録
   * Deviceにデバイス名が設定されていない場合はhubeaサーバーへの登録は行わない
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.Device.prototype.registerDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    // オンラインでない場合は少なくとも拒否する
    if (!isOnline()) {
      self.debug('registerDevice() is not acceptable in offline state.');
      self._callback(fail, Guardian.ErrorTypes.NETWORK_ERROR);
      return;
    }
    // 並行処理することもできるが、まずは直列に処理する
    self._registerDevice()
      .then(function() {
        // guardianサーバーへのデバイス登録
        return guardian._registerDeviceOnCloud(self);
      })
      .then(function() {
        self.isRegisteredDevice = true;
        // デバイス名登録(skip)
        /*
        if (self._edit('deviceName')) {
          return guardian._registerDeviceName(self);
        }
        */
      })
      .then(function() {
        self._commit();
        return guardian._storeDeviceCache(self);
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * デバイス登録解除処理を行う
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Guardian.Device.prototype.unregisterDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    var $dfd = $.Deferred().resolve();
    if (self._shouldCleanLocalKey()) {
      $dfd = self._unregisterDevice();
    }
    $dfd.then(function() {
      return guardian._unregisterDeviceOnCloud(self);
    }).then(function() {
      // Local Storageをクリア
      return guardian._clearDeviceCache(self.getUniqueId())
    })
    .done(function() {
      self._callback(success);
    })
    .fail(function(err, data) {
      self._callback(fail, [err, data]);
    });
  }

  /**
   * デバイス情報の更新(サーバーとの同期)を行う
   * 登録済みデバイス以外は要求を受け付けない
   */
  Guardian.Device.prototype.updateDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    if (!this.isRegistered()) {
      self.warn('updateDevice() called to unregistered device.');
      self._callback(fail, Guardian.ErrorTypes.INVALID_PARAM);
      return;
    }

    guardian._updateDeviceOnCloud(self)
      .then(function() {
        self._commit();
        return guardian._storeDeviceCache(self);
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._rollback();
        self._callback(fail, [err, data]);
      });
  }

  /**
   * デバイス設定情報を取得する
   */
  Guardian.Device.prototype.getDeviceSettings = function(success, fail) {
    var self = this;
    var guardian = this.guardian;
    var payload = this._getDeviceSettingTypes();
    if (!payload || payload.length == 0) {
      self._callback(success, {});
      return;
    }
    var lastError;
    self._startDataCommunication()
      .then(function() {
        var message = guardian.buildMessage(ASPE.MessageTypes.GET_DATA, payload);
        return self._sendMessage(message);
      })
      .done(function(response) {
        self.debug(response);
        var result = self._parseDeviceSettingReport(response);
        if (0 < Object.keys(result).length) {
          self._callback(success, result);
          return;
        }
        self._callback(fail, Guardian.ErrorTypes.MESSAGE_ERROR);
      })
      .fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        lastError = err;
        self.error('getDeviceSettings:[' + err + ']');
        self._callback(fail, [err, data]);
      })
      .always(function() {
        if (lastError != Guardian.ErrorTypes.CONNECTION_BUSY) {
          self._stopDataCommunication();
        }
      });
  }

  /**
   * デバイス設定情報を更新する
   */
  Guardian.Device.prototype.setDeviceSettings = function(args, success, fail) {
    var self = this;
    var guardian = this.guardian;
    hubeaLog('Guardian.Device.setDeviceSettings');

    args = self._filterDeviceSettingParams(args);
    if (Object.keys(args).length == 0) {
      this._callback(fail, Guardian.ErrorTypes.INVALID_PARAM);
      return;
    }
    var body = self._buildDeviceSettingData(args);
    hubeaLog(body);
    var lastError;

    self._startDataCommunication()
    .then(function() {
      self.debug('startDataCommunication OK');
      return self._setDataVerify(body);
    })
    .then(function() {
      self.debug('setDataVerify OK');
      for (var key in args) {
        if (typeof args[key] == 'object') {
          self._config(key, args[key]);
        }
      }
      return guardian._storeDeviceCache(self);
    })
    .done(function() {
      self.debug('storeDeviceCache OK');
      self._callback(success);
    })
    .fail(function(err, data) {
      if (!err) {
        err = Guardian.ErrorTypes.UNKNOWN;
      }
      lastError = err;
      self.error('setDeviceSettings:[' + err + ']');
      self._callback(fail, [err, data]);
    })
    .always(function() {
      if (lastError != Guardian.ErrorTypes.CONNECTION_BUSY) {
        self._stopDataCommunication();
      }
    });
  }

  /**
   * 接続要求時にデバイスがin range状態になるまで待ち合わせる時間(ms)
   */
  Guardian.Device.prototype._getInRangeTimeout = function() {
    return 15000;
  }

  /**
   * getDeviceSettings()内から呼ばれる
   * デバイスの取得可能なDATA_TYPEを配列で返す(デフォルトは空)
   */
  Guardian.Device.prototype._getDeviceSettingTypes = function() {
    return [];
  }

  /**
   * setDeviceSettings()内から呼ばれる
   * デバイスに設定可能なパラメータ(property値)をフィルタして返す(デフォルトは空)
   */
  Guardian.Device.prototype._filterDeviceSettingParams = function(args) {
    return {};
  }

  /**
   * リクエストパラメータからSET_DATA用のPayloadデータを生成する
   */
  Guardian.Device.prototype._buildDeviceSettingData = function(args) {
    var body = new ASPEData();
    for (var key in args) {
      var dataType;
      var payload = [];
      var options = args[key];
      // TODO: implements
    }
    return body;
  }

  /**
   * getDeviceSettings()内から呼ばれる
   * INPUT_REPORTを含むMessageからDATA_TYPE毎の情報を整形して返す
   * INPUT_REPORTではない、または識別可能なDATA_TYPEが含まれていない場合は空のオブジェクトを返す
   */
  Guardian.Device.prototype._parseDeviceSettingReport = function(response) {
    var result = {};
    var reportData = response.getReportData();
    if (reportData) {
      for (var i = 0; i < reportData.length; i++) {
        var payload = reportData[i].payload;
        // TODO: implements
        switch (reportData[i].dataType) {
        default:
          break;
        }
      }
    }
    return result;
  }

  Guardian.Device.prototype._registerDevice = function() {
    var self = this;
    var args = {
        deviceId: self.deviceId,
        localKeyId: self.guardian.__localKeyId
    };
    return $.Deferred(function($dfd) {
      self._switchCommunicationWithLocalKey(false)
        .then(function() {
          // 登録モードに移行
          return $._waitStartRegistration(args)
        })
        .then(function() {
          // localKeyの取得
          return $._getLocalKey(args);
        })
        .then(function(localKey) {
          if (!localKey) {
            // localKey新規生成と登録
            return $._setNewLocalKey(args);
          } else {
            // 登録済み
            return localKey;
          }
        })
        .done(function(localKey) {
          self.localKey = localKey;
          $dfd.resolve();
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        })
    });
  }

  /**
   * デバイス登録解除時にLocalKey削除が必要かどうか判定する
   * (LocalKey削除はタッチ判定が伴うことに注意)
   */
  Guardian.Device.prototype._shouldCleanLocalKey = function() {
    return false; //default
  }

  /**
   * デバイスのLocalKeyを削除する
   * 複数人が利用するケースで、誰かがデバイスのLocalKeyを削除すると他の人も再登録し直さないといけなくなる
   * (キャッシュしているLocalKeyでは繋がらなくなる）
   * 本処理を実行するユースケースは限定すること
   * @returns
   */
  Guardian.Device.prototype._unregisterDevice = function() {
    var self = this;
    var args = {
        deviceId: this.deviceId
    };
    return $.Deferred(function($dfd) {
      // 通信中は拒否
      if (self.inCommunication()) {
        self.warn('_unregisterDevice deviceId:' + self.deviceId + ' in communication.');
        $dfd.reject();
        return;
      }
      // JM1デバイス接続
      $._startCommunication(args)
        .then(function() {
          self.comm = {
            withLocalKey: false
          };
          // inRange状態待ち合わせ
          return $._waitInRange(args, self._getInRangeTimeout());
        })
        .then(function() {
          // 登録モードに移行
          return $._waitStartRegistration(args);
        })
        .then(function() {
          // localKeyの全削除
          return $._deleteAllLocalKeys(args);
        })
        .done(function() {
          $dfd.resolve();
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        })
        .always(function() {
          self._releaseCommunication();
        });
    });
  }

  /**
   * Device IDがまだない場合に周辺検索して再取得する
   * 実行端末が変わる等して、復元されたDevice Handle値の互換性が失われた場合はDevice IDが無い状態になる
   * そのような場合は周辺検索からやり直して再取得し直す
   */
  Guardian.Device.prototype._ensureDeviceId = function() {
    var self = this;
    var guardian = this.guardian;
    return $.Deferred(function($dfd) {
      if (self.deviceId) {
        $dfd.resolve();
        return;
      }
      $.hubea.util.repeat(500, function(handle, times) {
        if (10 < times) {
          self.error('_ensureDeviceId timeout.');
          handle.fail();
          return;
        }
        guardian.findDevice(self.getUniqueId(), function(device) {
          if (device) {
            handle.stop(device);
          }
        });
      }).then(function(device) {
        if (device.deviceId && device.deviceHandle) {
          self.deviceId = device.deviceId;
          self.deviceHandle = device.deviceHandle;
          return guardian._storeDeviceCache(self);
        }
        self.error('_ensureDeviceId unexpected device:' + JSON.stringify(device));
        return $._rejectAction();
      }).done(function() {
        $dfd.resolve();
      }).fail(function() {
        $dfd.reject();
      });
    });
  }

  /**
   * 接続中のLocalKeyを切り替える
   * デバイス未接続状態で呼び出した場合はエラーになる
   * 
   * @param withLocalKey:<boolean>  falseの場合鍵無しモードになる
   * @return deferred 
   */
  Guardian.Device.prototype._switchCommunicationWithLocalKey = function(withLocalKey) {
    var self = this;
    if (!self.isSwitchCommunicationSupported()) {
      return self._switchCommunicationFallback(withLocalKey);
    }
    return $.Deferred(function($dfd) {
      if (!self.inCommunication()) {
        self.warn('_switchCommunicationWithLocalKey:%s is NOT in communication.', self.deviceId);
        $dfd.reject(Guardian.ErrorTypes.CONNECTION_FAIL);
        return;
      }
      var $queries = [];
      var args = {
        deviceId: self.deviceId
      };
      if (self.inCommunicationWithLocalKey()) {
        if (withLocalKey) {
          $dfd.resolve();
          return;
        }
        if (self.comm.senderId) {
          $queries.push($._releaseDataBlockSender({
            senderId: self.comm.senderId
          }).done(function() {
            delete self.comm.senderId;
          }));
        }
        if (self.comm.receiverId) {
          $queries.push($._releaseDataBlockReceiver({
            receiverId: self.comm.receiverId
          }).done(function() {
            delete self.comm.receiverId;
          }));
        }
        // closeTimerチェックは呼び出し元でやっているものとする
      } else {
        if (!withLocalKey) {
          $dfd.resolve();
          return;
        }
        args.localKey   = self.localKey;
        args.localKeyId = self.guardian.__localKeyId;
      }
      var errorVal = Guardian.ErrorTypes.INRANGE_TIMEOUT;
      $.when.apply($, $queries)
        .then(function() {
          $._waitInRange(args, self._getInRangeTimeout())
        })
        .then(function() {
          errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
          return $._switchCommunication(args);
        })
        .then(function() {
          self.comm.withLocalKey = withLocalKey;
          console.warn('_switchCommunicationWithLocalKey:%s withLocalKey:%s', self.deviceId, self.comm.withLocalKey);
          errorVal = Guardian.ErrorTypes.INRANGE_TIMEOUT;
          return $._waitInRange(args, self._getInRangeTimeout());
        })
        .then(function() {
          errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
          if (withLocalKey) {
            $queries = [];
            if (!self.comm.senderId) {
              $queries.push($._getDataBlockSender(args).done(function(senderId) {
                self.comm.senderId = senderId;
              }));
            }
            if (!self.comm.receiverId) {
              $queries.push($._getDataBlockReceiver(args).done(function(receiverId) {
                self.comm.receiverId = receiverId;
              }));
            }
            return $.when.apply($, $queries);
          }
        })
        .done(function() {
          $dfd.resolve();
        })
        .fail(function(err) {
          $dfd.reject(errorVal);
        });
    });
  }

  /**
   * SwitchCommunication非対応処理
   * 基本的にCommunicationを貼り直すだけ
   */
  Guardian.Device.prototype._switchCommunicationFallback = function(withLocalKey) {
    var self = this;
    return $.Deferred(function($dfd) {
      if (!self.inCommunication()) {
        self.warn('_switchCommunicationFallback:%s is NOT in communication.', self.deviceId);
        $dfd.reject(Guardian.ErrorTypes.CONNECTION_FAIL);
        return;
      }
      var args = {
        deviceId: self.deviceId
      };
      if (self.inCommunicationWithLocalKey()) {
        if (withLocalKey) {
          $dfd.resolve();
          return;
        }
      } else {
        if (!withLocalKey) {
          $dfd.resolve();
          return;
        }
        args.localKey   = self.localKey;
        args.localKeyId = self.guardian.__localKeyId;
      }
      var errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
      // 一旦切断する
      self._releaseCommunication()
        .then(function() {
          return $._waitAction(1000);
        })
        .then(function() {
           return $._startCommunication(args);
        })
        .then(function() {
          self.comm = {
            withLocalKey: withLocalKey
          };
          console.warn('_switchCommunicationFallback:%s withLocalKey:%s', self.deviceId, self.comm.withLocalKey);
          errorVal = Guardian.ErrorTypes.INRANGE_TIMEOUT;
          return $._waitInRange(args, self._getInRangeTimeout());
        })
        .then(function() {
          errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
          if (withLocalKey) {
            var $queries = [];
            $queries.push($._getDataBlockSender(args).done(function(senderId) {
              self.comm.senderId = senderId;
            }));
            $queries.push($._getDataBlockReceiver(args).done(function(receiverId) {
              self.comm.receiverId = receiverId;
            }));
            return $.when.apply($, $queries);
          }
        })
        .done(function() {
          $dfd.resolve();
        })
        .fail(function(err) {
          $dfd.reject(errorVal);
        });
    });
  }

  /**
   * データ送受信を行う場合に必要な通信開始処理
   * senderId/receiverIdを利用しない場合は不要
   * データ送受信と実際のデバイス接続/切断処理は同期しない
   * つまり一回のデバイス接続中に複数のシーケンスが直列に実行されることがある
   * 但し、並列にシーケンスを実行することは許容しない(ASPE仕様上も禁止)
   * この処理でデバイス接続が開始された場合はASPEのSequence Number(F/Wが参照する場合のみ)はリセットされる
   */
  Guardian.Device.prototype._startDataCommunication = function() {
    var self = this;
    var args = {};

    if (this.localKey) {
      args.localKey   = self.localKey;
      args.localKeyId = self.guardian.__localKeyId;
    } else {
      // LocalKeyが割り当てられていない時は警告ログ
      self.warn('uniqueId:' + self.getUniqueId() + ' has no localKey.');
    }
    return $.Deferred(function($dfd) {
      // 通信シーケンス中は拒否
      if (self.inSession()) {
        $dfd.reject(Guardian.ErrorTypes.CONNECTION_BUSY);
        return;
      }
      var errorVal = Guardian.ErrorTypes.CONNECTION_FAIL;
      // JM1デバイス接続
      self._ensureDeviceId()
        .then(function() {
          args.deviceId = self.deviceId;
          // 切断処理中であれば待ち合わせ
          return self._waitCommunicationCriticalSection();
        })
        .then(function() {
          if (self.inCommunication()) {
            return self._switchCommunicationWithLocalKey(true);
          } else {
            return $._startCommunication(args);
          }
        })
        .then(function() {
          self.debug('_startDataCommunication[' + (self.inCommunication() ? 'reuse' : 'new') + '] OK.');
          if (!self.inCommunication()) {
            // new connection
            self.comm = {
              withLocalKey: true
            };
          }
          // inRange状態待ち合わせ
          errorVal = Guardian.ErrorTypes.INRANGE_TIMEOUT;
          return $._waitInRange(args, self._getInRangeTimeout());
        })
        .then(function() {
          self.debug('Communication inRange.');
          errorVal = Guardian.ErrorTypes.UNKNOWN;
          // sender id 取得
          if (self.comm.senderId) {
            return self.comm.senderId;
          }
          return $._getDataBlockSender(args);
        })
        .then(function(senderId) {
          self.debug('getDataBlockSender OK.');
          self.comm.senderId = senderId;
          // receiver id 取得
          if (self.comm.receiverId) {
            return self.comm.receiverId;
          }
          return $._getDataBlockReceiver(args);
        })
        .then(function(receiverId) {
          self.debug('getDataBlockReceiver OK.');
          self.comm.receiverId = receiverId;
        })
        .done(function() {
          // 通信シーケンス開始
          self.comm.session = {};
          $dfd.resolve();
        })
        .fail(function() {
          // native側に閉じてCommunicationがクローズされることがあると
          // JsではinRange状態しか把握できない。
          // FailSafeとしてinRangeでタイムアウトした時のcommunicationは積極的に破棄しておくことにする
          if (errorVal == Guardian.ErrorTypes.INRANGE_TIMEOUT) {
            self._releaseCommunication().always(function() {
              $dfd.reject(errorVal);
            });
          } else {
            $dfd.reject(errorVal);
          }
        })
    });
  }

  // データ送受信を行う場合に必要な通信終了処理
  // _startDataCommnunicationDevice()と対で呼び出す
  Guardian.Device.prototype._stopDataCommunication = function(immediately) {
    var self = this;
    if (self.comm) {
      if (immediately && self.comm.closeTimer) {
        self.debug('[CLEAR] closeTimer=' + self.comm.closeTimer);
        clearTimeout(self.comm.closeTimer);
        delete self.comm.closeTimer;
      }
      if (!self.comm.closeTimer) {
        var timeout = (immediately ? 0 : self.guardian.__dataCommTimout);
        self.comm.closeTimer = setTimeout(function() {
          self.debug('[RUN] closeTimer=' + self.comm.closeTimer);
          delete self.comm.closeTimer;
          self._releaseCommunication()
            .always(function() {
              self.debug('stopCommunication[timer] OK.');
            });
        }, timeout);
        self.comm.closeUntil = Date.now() + timeout;
        self.debug('[SET] closeTimer=' + self.comm.closeTimer + ' with ' + timeout + 'ms');
      }
      delete self.comm.session;
    }
  }

  Guardian.Device.prototype._releaseCommunication = function() {
    var self = this;
    self.debug('releaseCommunication:%s', self.deviceId);
    var $queries = [];
    if (self.comm) {
      self.comm.closing = true;
      if (self.comm.closeTimer) {
        self.debug('[CLEAR] closeTimer=' + self.comm.closeTimer);
        clearTimeout(self.comm.closeTimer);
      }
      if (self.comm.senderId) {
        $queries.push($._releaseDataBlockSender({
          senderId: self.comm.senderId
        }));
      }
      if (self.comm.receiverId) {
        $queries.push($._releaseDataBlockReceiver({
          receiverId: self.comm.receiverId
        }));
      }
    }
    //切断 (fallback含む)
    $queries.push($._stopCommunication({
      deviceId: self.deviceId
    }).always(function() {
      delete self.comm;
    }));
    return $.when.apply($, $queries);
  }

  /**
   * ASPEMessage の送受信を行う
   * inRange状態で呼び出すこと
   * @param message: ASPEMessage
   * @returns
   */
  Guardian.Device.prototype._sendMessage = function(message) {
    var self = this;
    return $.Deferred(function($dfd) {
      var dataBlockBuffer;
      var requestType = message.getType();
      // 送信データ生成
      self._encrypt(message.data)
      .then(function(data) {
        self.debug('encrypt OK.');
        // メッセージ送信
        return $._sendDataBlock({
          senderId: self.comm.senderId,
          data: data
        });
      })
      .then(function() {
        self.debug('sendDataBlock OK.');
        // 応答メッセージ受信
        dataBlockBuffer = self._createDataBlockBuffer();
        return dataBlockBuffer.resolveMessage();
      })
      .then(function(response) {
        self.debug('resolveMessage[1] OK.');
        // GET_DATAの場合はメッセージブロックを最大２つ受信する(エラー時は１つ)
        if (requestType == ASPE.MessageTypes.GET_DATA) {
          var responseBlocks = response.getDataResponse();
          if (Array.isArray(responseBlocks) &&
              responseBlocks[0].responseType == ASPE.ResponseTypes.SUCCESS) {
            // 続くINPUT_REPORTがあれば読み出して返す
            return dataBlockBuffer.resolveMessage();
          }
        }
        return response;
      })
      .done(function(response) {
        self.debug('resolveMessage[2] OK.');
        $dfd.resolve(response);
      })
      .fail(function(err, data) {
        self.debug('_sendMessage fail.');
        if (!err) {
          err = Guardian.ErrorTypes.WRITE_ERROR;
        }
        $dfd.reject(err, data);
      });
    });
  }

  /**
   * 指定された ASPEData で SET_DATAメッセージを生成して実行する
   * ASPEData内のtype値の結果が全てSUCCESS応答だった場合のみ成功する
   * inRange状態で呼び出すこと
   * @param aspeData: ASPEData
   */
  Guardian.Device.prototype._setDataVerify = function(aspeData, success, fail) {
    var self = this;
    var guardian = this.guardian;

    hubeaLog('Guardian.Device._setDataVerify')
    var types   = aspeData.getTypes();
    var payload = aspeData.getPayload();
    if (payload.length == 0) {
      self._callback(fail, Guardian.ErrorTypes.INVALID_PARAM);
      return;
    }

    return $.Deferred(function($dfd) {
      var message = guardian.buildMessage(ASPE.MessageTypes.SET_DATA, payload);
      self._sendMessage(message)
        .then(function(response) {
          var responseBlocks = response.getDataResponse();
          if (Array.isArray(responseBlocks)) {
            types = types.filter(function(type) {
              for (var i = 0; i < responseBlocks.length; i++) {
                var dataType = responseBlocks[i].dataType;
                var responseType = responseBlocks[i].responseType;
                if (dataType == type && responseType == ASPE.ResponseTypes.SUCCESS) {
                  return false;
                }
              }
              return false;
            });
          }
          if (types.length == 0) {
            $dfd.resolve();
          } else {
            self.debug('ERR ASPERespose:', response);
            $dfd.reject(Guardian.ErrorTypes.MESSAGE_ERROR);
          }
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  /**
   * JM1デバイスからの受信データをバッファするオブジェクトを生成する
   */
  Guardian.Device.prototype._createDataBlockBuffer = (function() {

    function polling(obj) {
      return $.hubea.util.repeat(500, function(handle, times) {
        if (30 < times) {
          handle.fail(Guardian.ErrorTypes.READ_TIMEOUT);
          return;
        }
        if (!obj.device.comm || !obj.device.comm.receiverId) {
          handle.stop();
        }
        $._receiveDataBlock({
          receiverId: obj.device.comm.receiverId
        })
        .then(function(data) {
          var $queries = [];
          if (Array.isArray(data)) {
            // 1 messageを分割して受信するかは不明だが連結する
            data.forEach(function(txt, i) {
              $queries.push(obj.parse(txt));
            });
          } else {
            $queries.push(obj.parse(data));
          }
          return $.when.apply($, $queries);
        })
        .then(function() {
          var message = obj.resolver();
          if (message) {
            if (message instanceof Error) {
              handle.fail(Guardian.ErrorTypes.MESSAGE_ERROR);
            } else {
              handle.stop(message);
            }
          }
        })
        .fail(function() {
          handle.fail(Guardian.ErrorTypes.READ_ERROR);
        });
      });
    }

    return function() {
      var guardian = this.guardian;
      return {
        device: this,
        buffer: [],
        parse: function(txt) {
          var myObj = this;
          return this.device._decrypt(txt)
            .then(function(data) {
              myObj.buffer = myObj.buffer.concat(data);
            });
        },
        resolveMessage: function() {
          return polling(this);
        },
        resolver: function() {
          try {
            var message = guardian.fetchMessage(this.buffer);
            // skip buffer position
            this.buffer.splice(0, message.getLength());
            return message;
          } catch (e) {
            if (e instanceof ASPEException) {
              if (e.type == ASPEException.Types.TOO_SHORT_PACKET) {
                return; // continue
              }
            }
            return e;
          }
        }
      };
    }
  })();

  // [IN] data:Array<number> [OUT] string
  Guardian.Device.prototype._encrypt = function(data) {
    var self = this;
    return $.Deferred(function($dfd) {
      if (!self.localKey) {
        $dfd.resolve(hubea.util.toBase64(data));
        return;
      }
      $._generateCommand({
        deviceId: self.deviceId,
        payload: hubea.util.toBase64(data)
      })
      .then(function(result) {
        return $._encodeData({
          deviceId: self.deviceId,
          data: result.rawCommand,
          key: self.localKey
        });
      })
      .done(function(data) {
        $dfd.resolve(data);
      })
      .fail(function() {
        $dfd.reject(Guardian.ErrorTypes.HUBEA_JS_ERROR);
      });
    });
  }

  // [IN] data:string [OUT] Array<number>
  Guardian.Device.prototype._decrypt = function(data) {
    var self = this;
    return $.Deferred(function($dfd) {
      if (!self.localKey) {
        $dfd.resolve(hubea.util.base64ToArray(data));
        return;
      }
      $._decodeData({
        deviceId: self.deviceId,
        data: data,
        key: self.localKey
      })
      .then(function(data) {
        return $._parseRawCommand({
          deviceId: self.deviceId,
          rawCommand: data
        });
      })
      .done(function(result) {
        $dfd.resolve(hubea.util.base64ToArray(result.payload));
      })
      .fail(function() {
        $dfd.reject(Guardian.ErrorTypes.HUBEA_JS_ERROR);
      });
    });
  }

  Guardian.Device.prototype._callback = function(func, args) {
    var self = this;
    if (!$.isArray(args)) {
      args = [args];
    }
    if (typeof func === 'function') {
      setTimeout(function() {
        func.apply(self, args);
      }, 0);
    } else {
      self.warn('_callback(): func is not function.');
    }
  }

  /**
   * 重要
   * 非同期closeを行う上でstopCommunication要求とcallbackまでの間に
   * startCommunication要求が割り込もうとするタイミングがある
   * その間はstartCommunication要求を待ち合わせる必要があるためフラグで判定する
   */
  Guardian.Device.prototype._waitCommunicationCriticalSection = function() {
    var self = this;
    return $.Deferred(function($dfd) {
      // 切断タイマが設定中ならリセット
      if (self.comm && self.comm.closeTimer) {
        self.debug('[CLEAR] closeTimer=' + self.comm.closeTimer);
        clearTimeout(self.comm.closeTimer);
        delete self.comm.closeTimer;
      }
      // 切断タイマ実行中かどうかのチェック
      if (!self.comm || !self.comm.closing) {
        $dfd.resolve();
        return;
      }
      var timerId = setInterval(function() {
        if (!self.comm || !self.comm.closing) {
          clearInterval(timerId);
          $dfd.resolve();
        }
      }, 100);
    });
  }

  /** Purifier(APZ-451) **/
  var Purifier = function() {
    Guardian.Device.apply(this, arguments);
    this.shortName = 'APZ-451';
    this.btMode = true; // Bluetooth Mode (falseの場合、Wi-Fiモードで動作する)
    this.replacementTime = {
      filter: 4380,     // HEPAフィルタ交換時間(H)
      bulb: 7300        // UVバルブ交換時間(H)
    };
  }
  Purifier.prototype = Object.create(Guardian.Device.prototype);
  Purifier.prototype.constructor = Guardian.Device;
  // [ASPE] DEVICE SPECIFIC DATA TYPES
  Purifier.DataTypes = {
     DEVICE_STATUS : 0x80,
     POWER         : 0x81,
     WIND          : 0x82,
     AUTO_MODE     : 0x83,
     TIMER         : 0x84,
     UV_MODE       : 0x85,
  };
  // 設定情報プロパティ(内部定義)
  Purifier.Settings = {
    POWER: 'power',
    AUTO : 'auto',
    WIND : 'wind',
    TIMER: 'timer',
    UV   : 'uv'
  };

  /**
   * 接続モードを変更する
   * @param enabled
   * @return 変更成功したかどうか
   */
  Purifier.prototype.setBluetoothMode = function(enabled) {
    if (!this.isRegistered()) {
      this.error('This device is not registered.');
      return false;
    }
    if (enabled) {
      this.guardian._disconnectOnCloud(this);
    } else {
      this._stopDataCommunication(true);
      if (this.btMode) {
        // BLE->WiFiモード設定直後は一回サーバーへconnected確認が必要
        this.wifiAck = false;
      }
    }
    this.btMode = (enabled == true);
    return true;
  }

  /**
   * 製品名を取得する
   * (表示用でありJM1のProduct Nameではない)
   */
  Purifier.prototype.getModelName = function() {
    var modelName = "CDAP4500BCA";
    if (this.jm1 && this.jm1.productCode) {
      if (0 <= ['33A700D60A'].indexOf(this.jm1.productCode)) {
        modelName = "CDAP5500BCA";
      }
    }
    return modelName;
  }

  /**
   * サプライ交換時間(警告ランプ点灯する運転時間)を取得する
   * @return {
   *   filter: {number} HEPAフィルタ交換時間,
   *   bulb: {number} UVバルブ交換時間
   * }
   */
  Purifier.prototype.getReplacementTime = function() {
    var result = $.extend({}, this.replacementTime);
    if (this.jm1 && this.jm1.productCode) {
      // 旧バージョン(2.3以下)のみ交換時間が短い
      if (0 <= ['03AD259009', '4DABB74601', 'E00DC04E01', '9136315208'].indexOf(this.jm1.productCode)) {
        result.filter = 3000;
        result.bulb = 6000;
      }
    }
    return result;
  }

  Purifier.prototype.isBluetoothMode = function() {
    return this.btMode;
  }

  /**
   * 機器の状態を設定する(リモコン操作)
   * @param object: args
   * {
   *   power: state:boolean,     // 電源ON/OFF
   *   wind: level:number(1-5),  // 風量
   *   auto: state:boolean,      // AUTOモードON/OFF
   *   timer: hour:number(0-8),  // Timer
   *   uv: state:boolean         // UVモードON/OFF
   * }
   * @param (=Function): success
   * @param (=Function): fail
   */
  Purifier.prototype.setStatus = function(args, success, fail) {
    var self = this;
    var guardian = this.guardian;

    var aspeData = self._buildDeviceSettingData(args);
    var payload = aspeData.getPayload();
    if (payload.length == 0) {
      self._callback(fail, Guardian.ErrorTypes.INVALID_PARAM);
      return;
    }

    // モードに応じて送信先を決定する
    if (!self.isBluetoothMode()) {
      var message = guardian.buildMessage(ASPE.MessageTypes.SET_DATA, payload);
      guardian._sendMessageToCloud(self, message)
        .done(function() {
          // キューできただけで機器側の送信できた保証は無い
          self._callback(success);
        })
        .fail(function(err, data) {
          self._callback(fail, [err, data]);
        })
    } else {
      var lastError;
      self._startDataCommunication()
        .then(function() {
          // 状態設定要求
          return self._setDataVerify(aspeData);
        })
        .done(function() {
          self._callback(success);
        })
        .fail(function(err, data) {
          if (!err) {
            err = Guardian.ErrorTypes.UNKNOWN;
          }
          lastError = err;
          self.error('setStatus:[' + err + ']');
          self._callback(fail, [err, data]);
        })
        .always(function() {
          if (lastError != Guardian.ErrorTypes.CONNECTION_BUSY) {
            self._stopDataCommunication();
          }
        });
    }
  }

  /**
   * 機器の状態を取得する(リモコン操作)
   *
   */
  Purifier.prototype.getStatus = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    // モードに応じて取得先を決定する
    if (!self.isBluetoothMode()) {
      var $dfd = $.Deferred().resolve();
      if (!this.wifiAck) {
        $dfd = guardian._connectOnCloud(self)
          .done(function() {
            self.wifiAck = true;
          });
      }
      $dfd.then(function() {
        return guardian._getStatusOnCloud(self);
      }).done(function(response) {
        self._callback(success, response);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
    } else {
      var lastError;
      self._startDataCommunication()
        .then(function() {
          // 状態取得要求
          var message = guardian.buildMessage(ASPE.MessageTypes.GET_DATA, [Purifier.DataTypes.DEVICE_STATUS]);
          return self._sendMessage(message);
        })
        .done(function(response) {
          var status = self._parseDeviceSettingReport(response);
          self._callback(success, status);
        })
        .fail(function(err, data) {
          if (!err) {
            err = Guardian.ErrorTypes.UNKNOWN;
          }
          lastError = err;
          self.error('getStatus:[' + err + ']');
          self._callback(fail, [err, data]);
        })
        .always(function() {
          if (lastError != Guardian.ErrorTypes.CONNECTION_BUSY) {
            self._stopDataCommunication();
          }
        });
    }
  }

  // Override

  /**
   * デバイス登録処理(機器側のみ)
   * APZ-451はJM1の登録モードの使用可能期間が機器側のタイマ値に依存するため
   * 実際の登録処理タイミングとは異なる契機で実行する必要がある
   * (従って、本来の登録要求(registerDevice)はサーバーへの登録のみとなる)
   * この処理ではデバイスへの接続開始処理は行わないため、startCommunication()実行後に呼び出すこと。
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Purifier.prototype.registerDeviceLocal = function(success, fail) {
    var self = this;
    self._registerDevice()
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * デバイス登録処理を行う
   * この処理ではサーバーへの登録処理とキャシュ更新のみ行うためデバイス間通信は必要ないが
   * デバイス側のLocalKeyを読み出していない状態で呼び出されるとエラーとなるため
   * 事前にregisterDeviceLocal()を実行しておく必要がある
   *
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Purifier.prototype.registerDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    // オンラインでない場合は少なくとも拒否する
    if (!isOnline()) {
      self.debug('registerDevice() is not acceptable in offline state.');
      self._callback(fail, Guardian.ErrorTypes.NETWORK_ERROR);
      return;
    }
    if (!self.localKey) {
      self.debug('registerDevice() is not acceptable without device localKey.');
      self._callback(fail, Guardian.ErrorTypes.INVALID_PARAM);
      return;
    }
    // guardianサーバーへのデバイス登録
    guardian._registerDeviceOnCloud(self)
      .then(function() {
        self.isRegisteredDevice = true;
        // デバイス名登録(skip)
        /*
        if (self._edit('deviceName')) {
          return guardian._registerDeviceName(self);
        }
        */
      })
      .then(function() {
        self._commit();
        return guardian._storeDeviceCache(self);
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * デバイスリセット処理を行う
   * @param {Function=} success: 成功時に呼び出されるコールバック
   * @param {Function=} fail: 失敗時に呼び出されるコールバック
   */
  Purifier.prototype.resetDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    guardian._resetDeviceOnCloud(self)
      .then(function() {
        // Local Storageをクリア
        return guardian._clearDeviceCache(self.getUniqueId())
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * BwGatewayの初期設定(登録)を行わずWiFiを利用する場合に利用する
   * 事前に第三者によるPINコード設定が済んでいる必要がある
   * @param {string} pin - PINコード
   * @param success
   * @param fail
   */
  Purifier.prototype.validatePinCode = function(pin, success, fail) {
    var self = this;
    var guardian = this.guardian;

    guardian._checkWifiAccessCodeOnCloud(self, pin)
      .then(function() {
        // WiFiが許可された状態を保存
        self.setPinCode(pin);
        return guardian._updateDeviceOnCloud(self);
      })
     .then(function() {
        return guardian._storeDeviceCache(self);
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  Purifier.prototype._getDeviceSettingTypes = function() {
    return [
      Purifier.DataTypes.DEVICE_STATUS
    ];
  }

  Purifier.prototype._filterDeviceSettingParams = function(args) {
    //var availableParams = ['power', 'wind', 'auto', 'timer', 'uv'];
    var availableParams = Object.keys(Purifier.Settings).map(function(key) {
      return Purifier.Settings[key];
    });
    var ret = $.extend({}, args);
    Object.keys(ret).forEach(function(key, i) {
      if (availableParams.indexOf(key) < 0) {
        delete ret[key];
      }
    });
    return ret;
  }

  Purifier.prototype._buildDeviceSettingData = function(args) {
    var body = new ASPEData();
    var power = true;
    // [1] SET_DATA内に含めるDATA TYPEが複数ある場合には順序のルールがある
    //     power > auto mode > その他(wind/timer/uv mode)
    // [2] auto mode が on の場合、windは(設定できても)有効にならない
    //     (auto modeによる風量が優先されるため)
    // [3] powerがoffの場合は、他のステータスを追加しない(mcuが応答しないため)
    [Purifier.Settings.POWER,
     Purifier.Settings.AUTO,
     Purifier.Settings.WIND,
     Purifier.Settings.TIMER,
     Purifier.Settings.UV
    ].forEach(function(key, i) {
      if (!power || !args.hasOwnProperty(key)) {
        return;
      }
      var dataType, payload;
      var value = args[key];
      switch(key) {
      case Purifier.Settings.POWER:
        dataType = Purifier.DataTypes.POWER;
        payload = [value ? 1 : 0];
        power = (payload == 1);
        break;
      case Purifier.Settings.WIND:
        var data = Number(value);
        if (!isNaN(data) && 1 <= data && data <= 5) {
          dataType = Purifier.DataTypes.WIND;
          payload = [data-1];
        }
        break;
      case Purifier.Settings.AUTO:
        dataType = Purifier.DataTypes.AUTO_MODE;
        payload = [value ? 1 : 0];
        break;
      case Purifier.Settings.TIMER:
        var data = Number(value);
        if (!isNaN(data) && 0 <= data && data <= 8) {
          dataType = Purifier.DataTypes.TIMER;
          payload = [data];
        }
        break;
      case Purifier.Settings.UV:
        dataType = Purifier.DataTypes.UV_MODE;
        payload = [value ? 1 : 0];
        break;
      default:
        break;
      }
      if (dataType && payload) {
        body.addData(dataType, payload);
      }
    });
    return body;
  }

  Purifier.prototype._parseDeviceSettingReport = function(response) {
    var result = {};
    var reportData = response.getReportData();
    if (reportData) {
      for (var i = 0; i < reportData.length; i++) {
        var payload = reportData[i].payload;
        switch (reportData[i].dataType) {
        case Purifier.DataTypes.DEVICE_STATUS:
          /*
           * [0] POWER(0,1)
           * [1] WIND (風量1=0,風量2=1,風量3=2,風量4=3,風量5=4)
           * [2] AUTO_MODE (0,1)
           * [3] TIMER (0,1-8)
           * [4] UV (0,1)
           * [5-6] AIR_QUALITY(BCD形式にて格納[0-650])
           * [7-8] FILTER_USED_TIME
           * [9-10] UV_BULB_USED_TIME
           */
          if (payload.length == 11) {
            result[Purifier.Settings.POWER] = (payload[0] == 1);
            result[Purifier.Settings.WIND]  = payload[1];
            result[Purifier.Settings.AUTO]  = (payload[2] == 1);
            result[Purifier.Settings.TIMER] = payload[3];
            result[Purifier.Settings.UV]    = (payload[4] == 1);
            result['airQuality'] = bcdVal(payload.slice(5,7));
            result['filterUsedTime'] = ((payload[7] & 0xFF) << 8) | (payload[8] & 0xFF);
            result['uvBulbUsedTime'] = ((payload[9] & 0xFF) << 8) | (payload[10] & 0xFF);

            // 電源OFF時は風量が0xFFになるようだ
            if (result['wind'] == 0xFF) {
              result['wind'] = 0;
            } else {
              result['wind'] += 1;
            }
          } else {
            this.warn('_parseDeviceSettingReport() invalid payload length:' + payload.length);
          }
        default:
          break;
        }
      }
    }
    return result;
  }

  /** Bluetooth-WiFi Gateway **/

  var BwGateway = function() {
    Guardian.Device.apply(this, arguments);
    this.shortName = 'BWG';
    this.cleanLocalKey = true; // default(デバイスが手元に無ければこのフラグを落として登録解除する)
    this.targetJm1UniqueId;    // 制御対象となる機器のjm1デバイスのuniqueId
  }
  BwGateway.prototype = Object.create(Guardian.Device.prototype);
  BwGateway.prototype.constructor = Guardian.Device;
  BwGateway.ErrorTypes = {
    AT_SEND_ERROR   : 0x41540001,
    AT_RECV_ERROR   : 0x41540002,
    AT_RECV_TIMEOUT : 0x41540003,
    /* ATコマンド(AT+CWJAP)のレスポンスエラーコード値にAP_ERROR_MASKをORしただけ */
    AP_ERROR_MASK         : 0x7FFFFF00,
    AP_CONNECTION_TIMEOUT : 0x7FFFFF01,
    AP_WRONG_PASSWORD     : 0x7FFFFF02,
    AP_NOT_FOUND          : 0x7FFFFF03,
    AP_CONNECTION_FAIL    : 0x7FFFFF04
  };

  /**
   * [デモ用]
   * 制御対象とする機器のJM1 uniqueIdを設定する
   * BLE/WiFi Gatewayの設定処理時のみ参照される
   */
  BwGateway.prototype.setTargetJm1UniqueId = function(uniqueId) {
    this._config('targetJm1', uniqueId);
  }

  /**
   * [デモ用]
   * 制御対象とする機器のJM1 uniqueIdを取得する
   */
  BwGateway.prototype.getTargetJm1UniqueId = function() {
    return this._config('targetJm1');
  }

  /**
   * Wi-Fi module version情報を取得する
   * initialSetupを実行していない場合や接続自体に失敗した場合はundefinedが返される
   */
  BwGateway.prototype.getWifiModuleVersion = function() {
    // 以下のような文字列(複数行)が含まれる
    // module versionに相当するのは"SDK version"の部分
    // -------------------------------
    // AT version:0.52.0.0(Jan  7 2016 18:44:24)
    // SDK version:1.5.1(e67da894)
    // compile time:Jan  7 2016 19:03:11
    // -------------------------------
    var wifiModuleVersion = this._config('wifiModuleVersion');
    if (typeof(wifiModuleVersion) == 'string') {
      var matches = wifiModuleVersion.match(/^SDK version:([0-9.]+)/m);
      if (matches && 1 < matches.length) {
        return matches[1];
      }
    }
  }

  //Override
  /**
   * この処理ではデバイスへの接続開始処理は行わないため、startCommunication()実行後に呼び出すこと。
   */
  BwGateway.prototype.registerDevice = function(success, fail) {
    var self = this;
    var guardian = this.guardian;

    // 並行処理することもできるが、まずは直列に処理する
    self._registerDevice()
      .then(function() {
        // petcareサーバーへのデバイス登録
        return guardian._registerDeviceOnCloud(self);
      })
      .then(function(response) {
        self.isRegisteredDevice = true;
        // 中継サーバー情報を一次オブジェクトに格納する
        self.sec = {
          url: response.bwgRelayUrl,
          port: response.bwgRelayPort,
          userId: response.bwgRelayUserId
        };
        self.warn('sec:', self.sec);
        self._commit();
        return guardian._storeDeviceCache(self);
      })
      .done(function() {
        self._callback(success);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * 通常のlocalKey削除後にATコマンドを流し込む必要がある
   * @see http://de.aplix.co.jp/redmine/issues/19678
   */
  BwGateway.prototype._unregisterDevice = function() {
    var self = this;

    return $.Deferred(function($dfd) {
      // call super
      Guardian.Device.prototype._unregisterDevice.apply(self)
        .done(function() {
          // localKey削除後なのでlocalKey無しでデータ通信する(この処理は待たせる必要があるが成否に影響しない事)
          setTimeout(function() {
            self.localKey = null;
            self._startDataCommunication()
              .then(function() {
                return self._doAtCommand(hubea.util.toBase64('AT+CWAUTOCONN=0\r\n'));
              })
              .done(function() {
                self.log('Process completed after unregistration.');
              })
              .fail(function() {
                self.error('Process failed after unregistration.');
              })
              .always(function() {
                self._stopDataCommunication(true);
                $dfd.resolve(); // 結果に依らず成功扱いとする
              });
          }, 1000);
        })
        .fail(function(err, data) {
          $dfd.reject(err, data);
        });
    });
  }

  BwGateway.prototype._getInRangeTimeout = function() {
    return 25000;
  }

  BwGateway.prototype._shouldCleanLocalKey = function() {
    return this.cleanLocalKey;
  }

  BwGateway.prototype.isSwitchCommunicationSupported = function() {
    // Gateway側のF/Wはver2.0ベースでiOSの場合には問題あるので非サポートする
    return (this.guardian && this.guardian.__systemInfo && this.guardian.__systemInfo.os != 'iOS');
  }

  /**
   * デバイス登録直後に行う必要のある処理
   * 引数argsにはWi-Fi設定のためのセキュリティ情報を付与する
   * 設定変更後に activate 要求をサーバーに対して実行する(初期登録かどうかに関わらず)
   * ・ssid: SSID
   * ・password: 暗号化キー
   * デバイスが接続中の場合は実行できない
   */
  BwGateway.prototype.initialSetup = function(args, success, fail) {
    var self = this;
    var guardian = this.guardian;

    if (!args) {
      self.error('Invalid params.');
      self._callback(fail);
      return;
    }
    if (!self.sec) {
      self.error('Relay information not found.');
      self._callback(fail);
      return;
    }
    var hasPassword = (args.password && 0 < args.password.length);

    // 下記のデータを1行ずつ順に送る(非暗号化)。
    // 1行送信した後にOK\r\n, ERROR\r\n, FAIL\r\nの受信を確認して次を送ること。
    var commands = [
      //'ATGW+DATA=?????', // <- 256以下  ※別途送信
      //'SSID\nPASSWORD\nServerAddress\nPort\nUserID',  ※別途送信
      'AT+GMR\r\n',
      'ATGW+RAPS\r\n',
      'ATE0\r\n',          // <- ECHO OFFは"ATE0"(デバッグ時にECHO ON)
      'AT+CWAUTOCONN=0\r\n',
      'AT+CWMODE_DEF=1\r\n',
      'AT+CWDHCP_DEF=1,1\r\n',
      'AT+UART_DEF=115200,8,1,0,3\r\n',
      'AT+CWJAP_CUR="%0",' +(hasPassword ? '"%1"' : '""')+ '\r\n',
      'ATGW+SAPS\r\n',
      'ATGW+RNWCS\r\n',
      'AT+CIPMUX=0\r\n',
      'AT+CIPSTART="TCP","%2",%3\r\n',
      'AT+CIPMODE=1\r\n',
      'ATGW+SNWCS\r\n',
      'ATGW+RNWDS\r\n',
      'AT+CIPCLOSE\r\n',
      'ATGW+SNWDS\r\n',
      'ATGW+RSDS\r\n',
      'AT+CIPSEND\r\n',
      'ATGW+SSDS\r\n',
      'ATGW+RUIDS\r\n',
      'ATGW+USERID=%4\r\n',
      'ATGW+SUIDS\r\n',
    ];

    var encrypted;
    var encryptedLength;
    var lastError;
    var $dfd = self._startDataCommunication()
      .then(function() {
        // 最初にECHO OFFは"ATE0"(デモ目的にECHO ON)
        var command = 'ATE0\r\n';
        self.debug('command:' + command);
        return self._doAtCommand(hubea.util.toBase64(command));
      })
      .then(function() {
        // encrypt secure data part
        // ssid, password中のダブルクォーテーションはbackslashでEscapeする。
        var ssid = args.ssid.replace(/"/g, '\\"');
        var password = (hasPassword ? args.password.replace(/"/g, '\\"')
                                    : 'dummy');
        var data = ssid + '\n' + password + '\n' + self.sec.url + '\n' + self.sec.port + '\n' + self.sec.userId;
        // generateCommandはせずにencodeのみ行う
        return $._encodeData({
          deviceId: self.deviceId,
          data: hubea.util.toBase64(data),
          key: self.localKey
        });
      })
      .then(function(data) {
        encrypted = data;// base64エンコード状態(そのまま送信)
        encryptedLength = hubea.util.base64ToArray(data).length;
        self.debug('encrypted:length = ' + encryptedLength);
        var command = 'ATGW+DATA=' + encryptedLength + '\r\n';
        self.debug('next command:' + command);
        return self._doAtCommand(hubea.util.toBase64(command));
      })
      .then(function() {
        self.debug('next command:' + encrypted);
        return self._doAtCommand(encrypted);
      });
      for (var i = 0; i < commands.length; i++) {
        $dfd = $dfd.then((function(command) {
          return function() {
            self.debug('next command:' + command);
            if (0 <= command.indexOf('AT+GMR')) {
              return self._doAtCommand(hubea.util.toBase64(command))
                .then(function(response) {
                  self.log('response:', response);
                  // "OK"行を除いたversion情報をメモリ上に保持する
                  try {
                    self._config('wifiModuleVersion', response.replace(/AT\+GMR[\r|\n]+|[\r|\n]+OK[\r|\n]+$/g, ''));
                  } catch (e) {
                    self.error('Unexpected wifi module version:', e);
                  }
                });
            } else if (0 <= command.indexOf('AT+CWJAP_CUR')) {
              // Access Point設定コマンドは結果をチェックする
              return self._doAtCommand(hubea.util.toBase64(command), 20000)
                .then(function(response) {
                  self.log('response:', response);
                  var errorVal;
                  var lines = response.split('\r\n');
                  for (var i = 0; i < lines.length; i++) {
                    var matches = lines[i].match(/\+CWJAP:(.+)/i);
                    if (matches) {
                      errorVal = parseInt(matches[1], 10);
                      continue;
                    }
                    if (0 <= lines[i].indexOf('OK')) {
                      return;
                    }
                    if (0 <= lines[i].indexOf('FAIL')) {
                      if (errorVal) {
                        errorVal |= BwGateway.ErrorTypes.AP_ERROR_MASK;
                      }
                      return $._rejectAction(errorVal);
                    }
                  }
                  //fail safe(OK も FAIL)
                  return $._rejectAction();
                });
            } else {
              return self._doAtCommand(hubea.util.toBase64(command));
            }
          }
        })(commands[i]));
      }
      //$dfd.then(function() {
        // setup成功時に都度サーバーに対して activate 処理を行う
      //  return guardian._activateDeviceOnCloud(self);
      //}).then(function() {
      $dfd.then(function() {
        self._config('ssid', args.ssid);
        self._config('password', args.password);
        self._updateWifiModuleVersion();
        return guardian._storeDeviceCache(self);
      }).done(function() {
        self._callback(success);
      }).fail(function(err, data) {
        if (!err) {
          err = Guardian.ErrorTypes.UNKNOWN;
        }
        lastError = err;
        self._callback(fail, [err, data]);
      }).always(function() {
        if (lastError != Guardian.ErrorTypes.CONNECTION_BUSY) {
          self._stopDataCommunication(true);
        }
      });
  }

  /**
   * デバイス情報更新時の再設定を行う
   * 中継サーバー情報やSSID等の情報を更新したい場合に使用する
   * 引数argsにはWi-Fi設定のためのセキュリティ情報を付与する
   * ・ssid: SSID
   * ・password: 暗号化キー
   * デバイスが接続中の場合は実行できない
   */
  BwGateway.prototype.reSetup = function(args, success, fail) {
    var self = this;
    var guardian = this.guardian;

    if (!this.isRegistered()) {
      // 未登録デバイスには使用できない
      self.log('Unregistered device could not use this function.');
      self._callback(fail);
      return;
    }
    if (!this._config('ssid') || !this._config('password')) {
      self.warn('ssid or password not found.');
    }

    // guardianサーバーへのデバイス登録(中継サーバー情報再取得)
    guardian._registerDeviceOnCloud(self)
      .done(function(response) {
        // 中継サーバー情報を一次オブジェクトに格納する
        self.sec = {
          url: response.bwgRelayUrl,
          port: response.bwgRelayPort,
          suserId: response.bwgRelayUserId
        };
        // デバイス設定
        self.initialSetup(args, success, fail);
      })
      .fail(function(err, data) {
        self._callback(fail, [err, data]);
      });
  }

  /**
   * 実デバイスのLocalKeyと同期する
   *
   * 未登録デバイスのみこの機能を利用できる。
   * 登録処理とは異なる用途で使用するため、このfunctionを実行した状態で
   * デバイス情報(LocalKey)を永続化してはいけない
   * 必ず正規の登録処理(registarDevice)を経由する事。
   * この処理は近接判定を伴うため、タッチ操作を前提とする
   */
  BwGateway.prototype.sneakLocalKey = function(success, fail) {
    var self = this;
    var args = {
      deviceId: self.deviceId,
      localKeyId: self.guardian.__localKeyId
    };
    if (self.localKey) {
      self.warn('deviceId:' + self.deviceId + ' has localKey[' + self.localKey + '] already.');
    }
    self.startCommunication(function() {
      // 登録モードに移行
      $._waitStartRegistration(args)
        .then(function() {
          return $._getLocalKey(args);
        })
        .then(function(localKey) {
          self.log('sneaked localKey=' + localKey);
          if (localKey) {
            return localKey;
          }
          return $._setNewLocalKey(args);
        })
        .then(function(localKey) {
          self.localKey = localKey;
          self._callback(success);          
        })
        .fail(function(err, data) {
          if (!err) {
            err = Guardian.ErrorTypes.REGISTRATION_ERROR;
          }
          self.error(err);
          self._callback(fail, [err, data]);
        })
        .always(function() {
          /*
          if (self.inCommunication()) {
            self.stopCommunication();
          }
          */
        });
    }, function(err, data) {
      self._callback(fail, [err, data]);
    });
  }

  /**
   * Access Point一覧の情報をBLE Wi-Fi Gatewayから取得する
   * @param {ssid:string|undefined, interval:number}: options
   * @param function: success
   * @param function: fail
   * @param function(Array<{ecn:number, ssid:string, rssi:string, mac:string, ch:number, freqOffset:number}>): update
   * @param function: fail
   *
   * ssidを指定しない場合は、スケルトンのアクセスポイントは取得できない
   * 接続に成功するとintervalで指定した間隔で一覧情報を更新してsuccessコールバックを呼び出す
   * 接続に失敗するとfailコールバックを呼び出して、以降のsuccessコールバックは行わない
   *
   * このfunctionを呼び出した場合、必ずstopAccessPontUpdate()を呼び出して更新処理を終了すること。
   */
  BwGateway.prototype.startAccessPointUpdate = function(options, success, fail, update) {
    var self = this;
    options = options || {};
    var ssid = options.ssid;
    var interval = options.interval || 5000;

    self.debug('startAccessPointUpdate called.');

    self._startDataCommunication()
    .then(function() {
      var command = 'AT+CWMODE=1\r\n';
      self.debug('command:' + command);
      return self._doAtCommand(hubea.util.toBase64(command));
    })
    .then(function() {
      var command = 'AT+UART_DEF=115200,8,1,0,3\r\n';
      self.debug('command:' + command);
      return self._doAtCommand(hubea.util.toBase64(command));
    })
    .done(function() {
      var apUpdater = {
        inProgress: false
      };
      var count = 0;
      var command = 'AT+CWLAP' + (ssid ? '="' + ssid + '"' : '') + '\r\n';
      var updateAccessPoint = function() {
        if (apUpdater.inProgress) {
          self.warn('updateAccessPoint in progress.');
          return true;
        }
        if (!self.inCommunication()) {
          self.warn('updateAccessPoint not in communication.');
          return false;
        }
        apUpdater.inProgress = true;
        var list;
        self.debug('command:' + command);
        self._doAtCommand(hubea.util.toBase64(command), 8000)
          .then(function(response) {
            // OK
            // +CWLAP:(<ecn>,<ssid1>,<rssi>,<mac>,<ch>,<freq offset>)
            // +CWLAP:(<ecn>,<ssid2>,<rssi>,<mac>,<ch>,<freq offset>)
            // …
            list = self._listAvailableAps(response);
            if (++count % 5 == 0) {
              // ATGW+R(記憶領域クリア)
              self.debug('command:ATGW+R\r\n');
              return self._doAtCommand(hubea.util.toBase64('ATGW+R\r\n'));
            }
          })
          .done(function() {
            if (list) {
              self._callback(update, [list]);
            }
          })
          .fail(function(err) {
            self.error('_doAtCommand failed[0x' + err.toString(16) + '].');
            if (err != BwGateway.ErrorTypes.AT_RECV_TIMEOUT) {
              apUpdater.stop($.noop);
            }
          })
          .always(function() {
            apUpdater.inProgress = false;
          });
        return true;
      }
      if (self.inCommunication()) {
        updateAccessPoint();
        apUpdater.intervalId = setInterval(function() {
          if (!updateAccessPoint()) {
            clearInterval(apUpdater.intervalId);
          }
        }, interval);
        // commリソースだと解放されてしまうのとGateway固有機能のためdevice objectに保持
        apUpdater.stop = function(complete) {
          clearInterval(apUpdater.intervalId);
          // 実行中のProcess終了待ち
          var waitId = setInterval(function() {
            if (!apUpdater.inProgress) {
              clearInterval(waitId);
              // session解放
              delete self.comm.session;
              delete self.apUpdater;
              complete.call();
            }
          }, 100);
        }
        self.apUpdater = apUpdater;
        self._callback(success);
      } else {
        self._callback(fail);
      }
    })
    .fail(function(err) {
      var errStr = err;
      if (typeof errStr == 'number') {
        errStr = '0x' + errStr.toString(16);
      }
      self.error('startAccessPointUpdate() error[' + errStr + ']');
      if (self.inCommunication()) {
        // session解放
        delete self.comm.session;
      }
      self._callback(fail, err);
    });
  }

  /**
   * startAccessPointUpdate()で開始したAccess Point一覧更新処理を終了する
   */
  BwGateway.prototype.stopAccessPointUpdate = function(success, fail) {
    var self = this;
    if (self.apUpdater) {
      self.apUpdater.stop(function() {
        //self._stopDataCommunication();
        self._callback(success);
      });
    } else {
      //self._stopDataCommunication();
      self._callback(success);
    }
  }

  /**
   * ATコマンドを１つ実行し、レスポンスを返す
   * _startDataCommunication()を実行した状態で呼び出すこと
   * 送信自体はsendRawを使う、commandのbase64エンコードは呼び出し元で選択的に実施
   * @param command:string (Base64 encoded)
   * @param timeout:number (option default 10000ms)
   */
  BwGateway.prototype._doAtCommand = function(command, timeout) {
    var self = this;
    timeout = timeout || 10000;
    return $.Deferred(function($dfd) {
      $._sendDataBlock({
        senderId: self.comm.senderId,
        data: command
      })
      .then(function() {
        var startTime = Date.now();
        var recv = '';
        var inProgress = false;
        return $.hubea.util.repeat(100, function(handle, times) {
          if (inProgress) {
            return;
          }
          if (Date.now() > (startTime + timeout)) {
            console.debug("_doAtCommand: AT_RECV_TIMEOUT", recv);
            handle.fail(BwGateway.ErrorTypes.AT_RECV_TIMEOUT);
            return;
          }
          if (!self.comm || !self.comm.receiverId) {
            console.debug("_doAtCommand: AT_RECV_ERROR", recv);
            handle.fail(BwGateway.ErrorTypes.AT_RECV_ERROR);
            return;
          }
          inProgress = true;
          $._receiveDataBlock({
            receiverId: self.comm.receiverId
          })
          .then(function(data) {
            if (Array.isArray(data) && data.length != 0) {
              for (var i = 0; i < data.length; i++) {
                // decodeURIComponentがURIErrorを吐くので飛ばす
                recv += hubea.util.base64ToByteText(data[i]);
              }
              // console.log("_doAtCommand: recv:" + recv);
              // 何れかの応答が入っていたら抜ける
              if (recv.indexOf('OK\r\n') !== -1 ||
                  recv.indexOf('ERROR\r\n') !== -1 ||
                  recv.indexOf('FAIL\r\n') !== -1) {
                handle.stop(recv);
              }
            }
          })
          .fail(function() {
            console.debug("_doAtCommand: fail: AT_RECV_ERROR");
            handle.fail(BwGateway.ErrorTypes.AT_RECV_ERROR);
          })
          .always(function() {
            inProgress = false;
          });
        });
      })
      .done(function(response) {
        self.debug('response:' + response);
        $dfd.resolve(response);
      })
      .fail(function(err) {
        console.debug("_doAtCommand: fail: %s", err);
        if (!err || typeof err == 'object') {
          err = BwGateway.ErrorTypes.AT_SEND_ERROR;
        }
        $dfd.reject(err);
      });
    });
  }

  /**
   * AT+CWLAP(Lists available APs)のコマンドレスポンスをAccess Pointのobject配列にして返す
   * {
   *   ecn:number,
   *   ssid:string,
   *   rssi:number,
   *   mac:string,
   *   ch:number,
   *   freqOffset:number
   * }
   *
   * 入力行には以下の形式でAccess Point情報が含まれている事を想定している
   * レスポンス値がエラーやAccess Point情報が含まれない場合は空の配列を返す
   *
   * +CWLAP:(<ecn>,<ssid>,<rssi>,<mac>,<ch>,<freq offset>)
   *
   * ()内は先頭から
   * -<ecn>:
   *  0:OPEN
   *  1:WEP
   *  2:WPA_PSK
   *  3:WPA2_PSK
   *  4:WPA_WPA2_PSK
   * -<ssid>:
   *  string, SSID of AP
   * -<rssi>:
   *  signal strength
   * -<mac>:
   *  string, MAC address
   * -<ch>:
   *  channel
   * -<freq offset>:
   *  frequency offset of AP, unit: KHz.<freq offset> / 2.4 to get unit“ppm”
   */
  BwGateway.prototype._listAvailableAps = function(data) {
    var accessPoints = [];
    if (!data) {
      return accessPoints;
    }
    var lines = data.split('\r\n');
    for (var i = 0; i < lines.length; i++) {
      var matches = lines[i].match(/\+CWLAP:\((.+)\)$/i);
      if (!matches) {
        continue;
      }
      var ap = {};
      var values = matches[1].split(',');
      for (var j = 0; j < values.length; j++) {
        var value = values[j].split('"').join(''); // remove dq
        switch(j) {
        case 0: //ecn
          ap.ecn = parseInt(value, 10);
          break;
        case 1: //ssid
          ap.ssid = value;
          break;
        case 2: //rssi
          ap.rssi = parseInt(value, 10);
          break;
        case 3: //mac
          ap.mac = value;
          break;
        case 4: //ch
          ap.ch = parseInt(value, 10);
          break;
        case 5: //freq offset
          ap.freqOffset = value;
          break;
        default:
          break;
        }
      }
      if (ap.ssid.length !== 0) {
        accessPoints.push(ap);
      }
    }
    return accessPoints;
  }

  /**
   * 中継サーバーDBにWiFi moduleのversion情報を記録する
   * 参考情報でしかないので現時点で成否は問わない
   */
  BwGateway.prototype._updateWifiModuleVersion = function() {
    var self = this;
    var guardian = this.guardian;
    var wifiModuleVersion = this._config('wifiModuleVersion');
    if (typeof(wifiModuleVersion) == 'string') {
      var params = {
        "bwg:wifi-module-version": wifiModuleVersion
      };
      guardian._setBwGatewayMetaData(self, params);
    }
  }

  //---------------deferred functions-------------------//

  $._resolveAction = function() {
    return $.Deferred().resolveWith(this, arguments).promise();
  }

  $._rejectAction = function() {
    return $.Deferred().rejectWith(this, arguments).promise();
  }

  $._waitAction = function(timeout, isReject) {
    var $dfd = $.Deferred();
    setTimeout(function() {
      if (isReject) {
        $dfd.reject();
      } else {
        $dfd.resolve();
      }
    }, timeout);
    return $dfd.promise();
  }

  $._hubeaReady = function() {
    return $.Deferred(function($dfd) {
      hubea.ready(function() {
        $dfd.resolve();
      })
    });
  }

  $._storageQueryKey = function(s) {
    return $.Deferred(function($dfd) {
      try {
        var args = {
          like: s
        };
        hubea.service.localStorage.queryKeys(args,
          function(result) {
            var keys = [];
            if (result && result['keys']) {
              keys = result['keys'];
            }
            $dfd.resolve(keys);
          },
          function() {
            $dfd.reject('[ERR] nativeIF queryKeys error.');
          }
        )
      } catch (e) {
        this.reject(e);
      }
    });
  }

  $._storageSave = function(key, value) {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.localStorage.setItem(key, value,
          function() {
//console.log('_storageSave() key[' + key + '] ----> value[' + value + '] OK.');
            $dfd.resolve();
          },
          function() {
            $dfd.reject('[ERR] nativeIF setItem error.');
          }
        );
      } catch (e) {
        this.reject(e);
      }
    });
  }

  $._storageRead = function(key) {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.localStorage.getItem(key,
          function(data) {
//console.log('_storageRead() key[' + key + '] ----> value[' + data + ']');
            $dfd.resolve(data);
          },
          function() {
            $dfd.reject('[ERR] nativeIF getItem error.');
          }
        );
      } catch (e) {
        this.reject(e);
      }
    });
  }

  $._storageRemove = function(key) {
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

  $._storageClear = function() {
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

  $._getScenarioId = function() {
    return $.Deferred(function($dfd) {
      try {
        hubea.service.model.Scenario.getInstance(function(scenario) {
          var id = 0; // 取得に成功した以上は値を付与する(初期値はサービス指定無し)
          if (scenario && scenario.id) {
            id = scenario.id;
          }
          $dfd.resolve(id);
        });
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  $._getNearbyBeacons = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.system.getNearbyBeacons(args,
          function(beacons) {
            $dfd.resolve(beacons);
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

  // JM1系
  $._getNearbyJm1s = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.getNearbyJm1s(args,
          function(jm1s) {
            $dfd.resolve(jm1s);
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

  $._getNearbyMemberAssignmentServices = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.getNearbyMemberAssignmentServices(args,
          function(jm1s) {
            $dfd.resolve(jm1s);
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

  $._getDevice = function(args) {
    return $.Deferred(function($dfd) {
      if (!args || Object.keys(args).length <= 0) {
        $dfd.resolve(-1);
      }
      try {
        hubea.jm1.getDevice(args,
          function(result) {
            $dfd.resolve(result.deviceId);
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

  $._getDeviceHandle = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.getHandle(args,
          function(result) {
            $dfd.resolve(result.deviceHandle);
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

  $._releaseDevice = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.release(args,
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

  $._startRegistration = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.startRegistration(args,
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

  $._switchCommunication = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.switchCommunication(args,
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

  $._waitStartRegistration = function(args) {
    return $.Deferred(function($dfd) {
      // 開始に成功するまで複数回リトライする
      var count = 6, interval = 500;
      var consume = function() {
        $._startRegistration(args)
        .done(function() {
          $dfd.resolve();
        })
        .fail(function() {
          if (0 < --count) {
            console.debug('[RETRY] startRegistration count:' + count);
            setTimeout(consume, interval);
          } else {
            $dfd.reject();
          }
        });
      };
      consume();
    });
  }

  $._startDeviceRegistration = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.startDeviceRegistration(args,
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

  $._setNewLocalKey = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.setNewLocalKey(args,
          function(result) {
            $dfd.resolve(result.localKey);
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

  $._getLocalKey = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.getLocalKey(args,
          function(result) {
            $dfd.resolve(result.localKey);
          },
          function(error) {
            // ZE_NOT_FOUNDは正常系なので「キー無し」として成功を返す
            if (error && error.code === hubea.jm1.ERR_ZE_NOT_FOUND) {
              $dfd.resolve();
            } else {
              $dfd.reject(error);
            }
          }
        );
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  $._deleteAllLocalKeys = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.deleteAllLocalKeys(args,
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

  $._startCommunication = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.startCommunication(args,
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

  $._stopCommunication = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.stopCommunication(args,
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

  $._inRange = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.inRange(args,
          function(result) {
            if (!result.inRange) {
              console.warn('$._inRange out of range.', args);
            }
            $dfd.resolve(result.inRange);
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

  $._waitInRange = function(args, timeout) {
    timeout = timeout || 1500;
    return $.Deferred(function($dfd) {
      try {
        // inRange状態になるのを待つ
        hubea.util.repeat(250,
          function(handle, times) {
            if (timeout < (times * 250)) {
              return false;
            }
            try {
              hubea.jm1.device.inRange(args,
                function(result) {
                  if (result.inRange) {
                    handle.stop(true);
                  }
                },
                function() {
                  handle.stop(false);
                }
              );
            } catch (e) {
              return e;
            }
          }
        ).done(function(res) {
          if (res === true) {
            $dfd.resolve();
          } else {
            $dfd.reject(res);
          }
        });
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }

  $._getDataBlockSender = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.getDataBlockSender(args,
          function(result) {
            $dfd.resolve(result.senderId);
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

  $._sendDataBlock = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataBlockSender.sendRaw(args,
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

  $._releaseDataBlockSender = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataBlockSender.release(args,
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
    })
  }

  $._getDataBlockReceiver = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.device.getDataBlockReceiver(args,
          function(result) {
            $dfd.resolve(result.receiverId);
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

  $._receiveDataBlock = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataBlockReceiver.getReceivedData(args,
          function(result) {
            $dfd.resolve(result.data);
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

  $._releaseDataBlockReceiver = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataBlockReceiver.release(args,
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
    })
  }

  // Command Generator
  $._generateCommand = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.commandGenerator.generateCommand(args,
          function(result) {
            $dfd.resolve(result);
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

  $._parseRawCommand = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.commandGenerator.parseRawCommand(args,
          function(result) {
            $dfd.resolve(result);
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

  $._encodeData = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataEncoder.encodeData(args,
          function(result) {
            $dfd.resolve(result.data);
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

  $._decodeData = function(args) {
    return $.Deferred(function($dfd) {
      try {
        hubea.jm1.dataEncoder.decodeData(args,
          function(result) {
            $dfd.resolve(result.data);
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
  
  $._getSystemInfo = function() {
    return $.Deferred(function($dfd) {
      try {
        hubea.system.getInfo(function(info) {
          $dfd.resolve(info);
        },
        function() {
          $dfd.reject();
        });  
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }
  
  $._getHubeaUserAgent = function() {
    return $.Deferred(function($dfd) {
      try {
        hubea.system.getUserAgent(function(ua) {
          $dfd.resolve(ua);
        },
        function() {
          $dfd.reject();
        });
      } catch (e) {
        $dfd.reject(e);
      }
    });
  }
  //-----------------------------------------------//

  /**
   * 永続化用(サーバーに投げるデータには使用しない)
   */
  function encode(data) {
    try {
      var refs = [];
      // json化し、base64エンコードする
      return hubea.util.toBase64(JSON.stringify(data, function(key, value) {
        if (value != null && typeof value == 'object') {
          if (0 < refs.indexOf(value)) {
            return;
          }
          refs.push(value);
        }
        return value;
      }));
    } catch(e) {
      console.error(e);
    }
    return "";
  }

  function decode(src) {
    // base64デコードし、jsonを取り出す(後方互換のためデコード失敗しても継続)
    try {
      src = hubea.util.base64ToText(src);
    } catch(e) {
      console.error('src[' + src + ']', e);
    }
    try {
      return JSON.parse(src);
    } catch(e) {
      console.error('src[' + src + ']', e);
    }
    return null;
  }

  /**
   * Binary code decimalに変換する
   * @param data: number array(1要素は1バイト分(2桁)とする)
   * @return
   */
  function bcdVal(data) {
    var ret = 0;
    if (!Array.isArray(data)) {
      data = [data];
    }
    data.forEach(function(val) {
      if (ret != 0) {
        ret *= 100;
      }
      var upper = (val >> 4) & 0x0F;
      var lower = (val & 0x0F);
      if (upper <= 9 && lower <= 9) {
        ret += ((upper * 10) + lower);
      }
    });
    return ret;
  }

  function uniqueIdFromUuid(uuid) {
    var matches = uuid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{2}([0-9a-f]{2})-[0-9a-f]{4}-([0-9a-f]{6})[0-9a-f]{6}/i);
    if (matches.length == 3) {
      return (matches[1] + matches[2]).toUpperCase();
    }
  }

  function getSearchParams() {
    var queryParam = window.location.search.slice(1);
    var params = queryParam.split('&');
    var data = {};
    params.forEach(function(param, i) {
      var kv = param.split('=');
      if (kv.length == 2) {
          data[kv[0]] = kv[1];
      }
    });
    return data;
  }

  function getHubeaServerTypeInParam() {
    var params = getSearchParams();
    if (params && params['hs']) {
      return params['hs'];
    }
    return 'p';
  }

  var __hubeaServerWithType = {
    p: 'hubea.mybeaconid.com',
    f: 'stage-2120918774-beacon-url-kicker-flight.mybeaconid.com',
    s: 'stage-170024877-beacon-url-kicker.mybeaconid.com',
    m: 'stage-2140789191-beacon-url-kicker2.mybeaconid.com',
    d: 'stage-324389862-beacon-url-kicker-dev.mybeaconid.com',
  };

  var __hubeaAppScrsWithType = {
    p: 'screens.hubea.com',
    f: 'screens-flight-l4v8ffvz.hubea.com' ,
    s: 'screens-stage-su3br6wc.hubea.com',
    m: 'screens-demo-zu7sgi0q.hubea.com',
    d: 'screens-dev-l4v8ffvz.hubea.com',
  };

  var __contentsServerWithType = {
    p: 'guardian.hubea.com',
    f: 'stage-g9txicyv-guardian.hubea.com',
    s: 'stage-g9txicyv-guardian.hubea.com',
    m: 'stage-g9txicyv-guardian.hubea.com',
    d: 'stage-g9txicyv-guardian.hubea.com',
  };

  var __bwgRelayServerWithType = {
    p: 'bwgsetting.hubea.com',
    f: 'stage-1683416917-bwg-relay.mybeaconid.com',
    s: 'stage-1683416917-bwg-relay.mybeaconid.com',
    m: 'stage-1683416917-bwg-relay.mybeaconid.com',
    d: 'stage-1683416917-bwg-relay.mybeaconid.com',
  };

  function fixHubeaServerByType(type) {
    var scheme = 'https';
    var host = __hubeaServerWithType[type];

    if (!host || type == 'l') {
      host = '127.0.0.1';
      scheme = 'http';
    }
    return scheme + '://' + host + '/bcnapp';
  }

  function fixHubeaAppScrsByType(type) {
    var scheme = 'https';
    var host = __hubeaAppScrsWithType[type];

    if (!host || type == 'l') {
      host = '127.0.0.1';
      scheme = 'http';
    }
    return scheme + '://' + host + '/app_scrs';
  }

  function fixGuardianServerByType(type) {
    var scheme = 'https';
    var host = __contentsServerWithType[type];

    if (!host || type == 'l') {
      host = '127.0.0.1';
      scheme = 'http';
    }
    return scheme + '://' + host + '/air';
  }

  function fixBwgRelayServerByType(type) {
    var scheme = 'https';
    var host = __bwgRelayServerWithType[type];

    if (!host || type == 'l') {
      host = '127.0.0.1';
      scheme = 'http';
    }
    return scheme + '://' + host;
  }

  function getBrowserLanguage() {
    try {
      return (navigator.browserLanguage || navigator.userLanguage || navigator.langurage).substr(0, 2);
    } catch(e) {
      return undefined;
    }
  }

  function isOnline() {
    return window.navigator.onLine;
  }

  function toLocaleDateTimeString(date) {
    return [ date.getFullYear(),
             ('0'+(date.getMonth() + 1)).slice(-2),
             ('0'+date.getDate()).slice(-2) ].join('-') +' '+
             ('0'+date.toLocaleTimeString()).slice(-8);
  }
  function toUTCDateTimeString(date) {
    return [ date.getUTCFullYear(),
             ('0'+(date.getUTCMonth() + 1)).slice(-2),
             ('0'+date.getUTCDate()).slice(-2) ].join('-') +' '+
           [ ('0'+date.getUTCHours()).slice(-2),
             ('0'+date.getUTCMinutes()).slice(-2),
             ('0'+date.getUTCSeconds()).slice(-2) ].join(':');
  }

  // str が deploy 時に置換済みであればそのまま返却
  // 未 deploy のため置換されていない場合は undefined を返却
  function fixReplacementString(str) {
    if (str && str.charAt(0) != '#') {
      return str;
    }
  }

  /**
   * Webインスペクタが使用できない場合のログ
   */
  function hubeaLog(msg) {
    if (msg) {
      hubea.debug.log('[GUARDIAN]' + msg);
    } else {
      // hubeaログはnullやundefinedを渡せない
      hubea.debug.log('[GUARDIAN] undefined message');
    }
  }

  var absUrlFunc = (function() {
    var a = document.createElement('a');
    return function(url) {
        a.href = url;
        return a.href;
    };
  })();

  var md5Func = function(src) {
    return '';  // if need(default blank).
  }
  if (typeof CryptoJS !='undefined' && typeof CryptoJS.MD5 != 'undefined') {
    md5Func = function(src) {
      var hash = CryptoJS.MD5(src);
      return hash.toString(CryptoJS.enc.Base64);
    }
  }

  window.Guardian    = Guardian;
  window.Purifier    = Purifier;
  window.BwGateway   = BwGateway;

})(jQuery);
