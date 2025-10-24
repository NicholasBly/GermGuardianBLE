
//##### package-define.js #####

/**
 * @preserve Copyright (C) 2015-2017 Aplix and/or its affiliates. All rights reserved.
 */

/**
 * ダブりチェックが簡単になるように、
 * 必ずアルファベット順に記述すること。
 * @const
 */
var hubea = {
  app: {},
  debug: {},
  demo: {
    audio: {},
    blockSender: {},
    digitalOut: {}
  },
  device: {},
  event: {},
  jm1: {
    commandGenerator: {},
    dataBlockReceiver: {},
    dataBlockSender: {},
    dataEncoder: {},
    device: {},
    digitalOutput: {}
  },
  nativeif: {},
  security: {},
  service: {
    contents: {},
    hubeaService: {},
    localStorage: {},
    model: {}
  },
  system: {
    activity: {},
    net: {
      socket:{}
    },
    notification: {},
    picker: {}
  },
  typedef: {},
  util: {}
};

//##### typedef.js #####

/*
 * Copyright (C) 2015 Aplix and/or its affiliates. All rights reserved.
 */

/*
 * JsDocのためのtypedefをここに記述する。
 * コードは書かないこと！
 */

/**
 * Jm1検索のコールバック関数。
 * 引数は以下の通り。
 * serviceUuid
 * productId
 * rssi
 * desc
 * @typedef {function(string, string, number, string)}
 */
hubea.typedef.Jm1SearchListener;

/**
 * Beaconレンジングリスナー
 * @typedef {function(Array<{proximityUuid:string, major:number, minor:number, proximity:number}>)}
 */
hubea.typedef.BeaconRangingListener;

//##### error-code.js #####

/**
 * 共通のエラーコード。
 * onFailedで渡されるエラーオブジェクトは基本的に以下の構造を取る。
 *
 * {
 *   code: string,
 *   message: string
 * }
 *
 * この'code'に入る文字列の定義群。
 * 'message'は人間が見る用途に固定するのでロジックに入れるのは禁止。
 * 'code'以外のパラメータが必要なのであればエラーオブジェクトのキーを拡張する。
 *
 * 各functionで独自のエラーコードを定義する場合は、
 * 値のバッティングを防ぐため以下の構造にすること。
 *
 * 例：
 *   hubea.jm1.device.getDataBlockReceiver.ERR_HOGE = 'LOC: hoge';
 *
 * - functionにぶら下げることで'ERR_...'の上書きを防ぐ
 * - 'LOC: 'をPrefixにすることで共通エラーとの値のバッティングを防ぐ。
 *   他のfunctionの値とはバッティングしても構わない。
 */
(function() {

  /**
   * エラーを出したほうもよく分かってない謎のエラー。
   * とりあえずのエラーとか。乱用禁止。
   * @const
   */
  hubea.ERR_UNKNOWN = 'unknown';

  /**
   * サポート外の呼び出し。
   * @const
   */
  hubea.ERR_UNSUPPORTED = 'unsupported';

  /**
   * 未実装。開発途中。
   * @const
   */
  hubea.ERR_UNIMPLEMENTED = 'unimplemented';

  /**
   * 未定義functionエラー。削除済みのfunction等。
   * @const
   */
  hubea.ERR_FUNCTION_NOT_FOUND = 'function not found';

})();

//##### hubea-scheme.js #####

/**
 * hubea nativeスキーム
 */
(function() {

  'use strict';

  /** @const */ hubea.nativeif.SCHEME = 'hubea-native-if';

})();
//##### hubea.js #####

(function() {

  'use strict';

  var ID_MIN = 49152;
  var ID_MAX = 65535;
  var nextId = ID_MIN + 1;

  var callbacks = {};
  var eventHandlers = {};
  var osName = 'Unknown';
  var isOnHubea;
  var isOnPc;
  var callNativeImpl;
  var iframeParams = {};
  var hubeaInfo = {};
  var isInitialized = false;
  var readyCallbacks = [];
  var lang = 'en';

  /** @type {hubea.typedef.Jm1SearchListener} */
  var jm1SearchListener;

  /** @type {hubea.typedef.BeaconRangingListener} */
  var beaconRangingListener;

  var __HUBEA_JS_PATH;// = __getHubeaJsPath;

  /**
   * @param {string} name
   * @param {?*} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  function callNative(name, args, onSuccess, onFailed) {
    var params = {
      id: ID_MIN,
      name: name,
      iframe: iframeParams
    };

    if (onSuccess || onFailed) {
      params.id = nextId++;
      callbacks[params.id] = {
        onSuccess: onSuccess,
        onFailed: onFailed
      };
      if (nextId > ID_MAX) {
        nextId = ID_MIN + 1;
      }
    }
    callNativeImpl(params, args);
  }

  function callNativeImplIos(params, args) {
    var iframe = document.createElement('iframe');
    var uri = hubea.nativeif.SCHEME+'://';

    if (params.iframe.nativeToken) {
      uri += params.iframe.id + ':' + params.iframe.nativeToken + '@';
    }
    uri += params.name + ':' + params.id + '/';
    switch (typeof args) {
    case 'string':
      uri += encodeURIComponent(args);
      break;
    case 'boolean':
      uri += (args ? 'true' : 'false');
      break;
    default:
      uri += encodeURIComponent(JSON.stringify(args));
      break;
    }
    //console.log(uri);
    iframe.src = uri;
    document.body.appendChild(iframe);
    iframe.parentNode.removeChild(iframe);
  }

  function callNativeImplAndroid(params, args) {
    // NOTE:
    // Lollipop(5.1)以降は Javaメソッドのパラメータ・戻り値に Javaオブジェクトが
    // 使えなくなるらしい、など制限増える方向のみの様相でもあり、
    // 当面 WebView.addJavascriptInterface()無し
    // （現状 callNativeImplIos() と同実装）
    var iframe = document.createElement('iframe');
    var uri = hubea.nativeif.SCHEME+'://';

    if (params.iframe.nativeToken) {
      uri += params.iframe.id + ':' + params.iframe.nativeToken + '@';
    }
    uri += params.name + ':' + params.id + '/';
    switch (typeof args) {
    case 'string':
      uri += encodeURIComponent(args);
      break;
    case 'boolean':
      uri += (args ? 'true' : 'false');
      break;
    default:
      uri += encodeURIComponent(JSON.stringify(args));
      break;
    }
    //console.log(uri);
    iframe.src = uri;
    document.body.appendChild(iframe);
    iframe.parentNode.removeChild(iframe);
  }

  function callNativeImplPc(params, args) {
    log('callNative: params:' + JSON.stringify(params) + ' args:' + JSON.stringify(args));
  }

  function log(msg) {
    // JSON.stringifyで出そうと思ったが、でかいオブジェクトだときついので
    // 基本的に呼び出し側で文字列化する想定
    callNative('log', msg.toString());
  }

  /**
   * @param {?Function=} func
   * @param {?*=} args
   */
  function doCallback(func, args) {
    if (func) {
      // 返り値は必ず非同期で返す
      setTimeout(function() {
        func.call(null, args);
      }, 0);
    }
  }

  /**
   * @param {!{serviceUuid:string, productId:string, rssi:number, desc:string}} args
   */
  function discoverJm1(args) {
    if (jm1SearchListener) {
      setTimeout(function() {
        if (jm1SearchListener) {
          jm1SearchListener.call(null, args.serviceUuid, args.productId, args.rssi, args.desc);
        }
      }, 0);
    }
  }

  function rangingBeacons(args) {
    if (beaconRangingListener) {
      setTimeout(function() {
        if (beaconRangingListener) {
          beaconRangingListener.call(null, args);
        }
      }, 0);
    }
  }

  /**
   * 汎用forEach。
   * lengthと[]によるインデックスアクセスが可能なオブジェクトで使用可能。
   */
  function forEach(array, func) {
    var len = array.length;
    for (var i = 0; i < len; i++) {
      func(array[i], i);
    }
  }

  Object.defineProperty(hubea, 'isOnPc', {
    get: function() {
      return isOnPc;
    }
  });

  /**
   * 初期化コールバック
   * @param {Function} onReady
   */
  hubea.ready = function(onReady) {
    if (isInitialized) {
      doCallback(onReady);
    } else {
      readyCallbacks.push(onReady);
    }
  };

  /**
   * @param {string} name
   * @param {?*} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.callNative = function(name, args, onSuccess, onFailed) {
    return callNative(name, args, onSuccess, onFailed);
  };

  /**
   * @param {?Function=} func
   * @param {?*=} args
   */
  hubea.doCallback = function(func, args) {
    return doCallback(func, args);
  };

  /**
   * アプリックス管理下のurlかどうかを取得する。
   * @param {(string|Object)} url
   */
  hubea.isManagedUrl = function(url) {
    var urlData = url;

    if (typeof url == 'string') {
      urlData = hubea.util.parseUrl(url);
    }

    var hostname = urlData.hostname;

    if (hostname.match(/^([^\.]*\.)*mybeaconid\.com$/i)) { return true; }
    if (hostname.match(/^([^\.]*\.)*aplix\.co\.jp$/i)) { return true; }
    if (hostname.match(/^([^\.]*\.)*hubea\.com$/i)) {
      if (!hostname.match(/^([^\.]*\.)*contents\.hubea\.com$/i)) { return true; }
    }
    return false;
  }

  /**
   * ログ出力
   * @param {string} msg 出力する文字列
   */
  hubea.debug.log = function(msg) {
    return log(msg);
  };

  /**
   * Nativeからの返り値通知
   * @param {number|string} id call-id or event name
   * @param {Object} args 引数
   * @param {boolean} isSuccess 成功、失敗のどちらのコールバックに返すか
   */
  hubea.event.post = function(id, args, isSuccess) {
    switch (typeof id) {
    case 'number':
      var callbackFuncs = callbacks[id];

      if (callbackFuncs) {
        var func;

        if (isSuccess) {
          func = callbackFuncs.onSuccess;
        } else {
          func = callbackFuncs.onFailed;
        }
        doCallback(func, args);
      }
      delete callbacks[id];
      break;
    case 'string':
      switch (id) {
      case 'discoverJm1':
        /** @suppress {checkTypes} */
        (function() {
          discoverJm1(args);
        })();
        break;
      case 'rangingBeacons':
        rangingBeacons(args);
        break;
      default:
        if (eventHandlers[id]) {
          eventHandlers[id].call(null, args);
        }
        break;
      }
      break;
    }
  };

  /**
   * イベントハンドラーを設定する。
   * 設定できるイベントハンドラーは各イベント辺り一つだけ。
   * nullを設定すると解除される。
   *
   * イベント一覧
   * 'onResume' - ActivityのonResume相当。引数無し。
   *
   * @param {string} events 空白区切りのイベント名
   * @param {function(Object=)} handler イベントハンドラー
   */
  hubea.event.bind = function(events, handler) {
    events.split(/\s+/).forEach(function(event) {
      if (event.length > 0) {
        eventHandlers[event] = handler;
      }
    });
  };

  /**
   * System情報の取得
   * @param {function(!{
   *     os:string,
   *     isOnHubea:boolean,
   *     hubeaInfo:!{
   *       type:string,
   *       versionCode:number,
   *       versionName:string
   *     }
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.getInfo = function(onSuccess, onFailed) {
    if (isOnHubea === undefined) {
      isOnHubea = false;
      hubeaInfo.type = 'Unknown';
      hubeaInfo.versionCode = -1;
      hubeaInfo.versionName = 'Unknown';
      hubeaInfo.clAppVersionCode = -1;
      hubeaInfo.clAppVersionName = 'Unknown';
      callNative('areYouHubea', null, function(result) {
        // ここは非同期で呼ばれるので、下のdoCallbackで調整。
        switch (typeof result) {
        case 'object':
          isOnHubea = result.isOnHubea;
          hubeaInfo.type = result.type;
          hubeaInfo.versionCode = result.versionCode;
          hubeaInfo.versionName = result.versionName;
          hubeaInfo.clAppVersionCode = result.clAppVersionCode;
          hubeaInfo.clAppVersionName = result.clAppVersionName;
          break;
        case 'boolean':
          isOnHubea = result;
          break;
        default:
          // hubeaでは無いと判断
          break;
        }
        doCallback(onSuccess, {
          os: osName,
          isOnHubea: isOnHubea,
          hubeaInfo: hubeaInfo
        });
      });
      return;
    }
    doCallback(function() {
      // この時点でisOnHubeaは設定済みのはず。
      doCallback(onSuccess, {
        os: osName,
        isOnHubea: isOnHubea,
        hubeaInfo: hubeaInfo
      });
    });
  };

  /**
   * UserAgent情報を取得する
   * hubeaサーバーへのリクエストに使用している"userAgent"プロパティ内のkey/valueを全て取得する
   *
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.getUserAgent = function(onSuccess, onFailed) {
    callNative('system.getUserAgent', null, onSuccess, onFailed);
  };

  /**
   * iframe動作モードに設定する
   * @param {!{id:string, url:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.setIframeMode = function(args, onSuccess, onFailed) {
    if (iframeParams.myToken) {
      var params = {
        id: args.id,
        url: args.url,
        token: iframeParams.myToken
      };
      callNative('system.setIframeMode', params, function(res) {
        iframeParams.id = params.id;
        iframeParams.url = params.url;
        iframeParams.nativeToken = res.token;
        doCallback(onSuccess);
      }, onFailed);
    }
  };

  /**
   * 対応するアプリがインストールされているかどうかを取得
   * iOSの場合：
   *   uri: カスタムURI。必須
   * @param {!{uri:?string}} info アプリ情報
   * @param {Function} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.isAppInstalled = function(info, onSuccess, onFailed) {
    switch (osName) {
    case 'iOS':
    case 'Android':
      callNative('canOpenUrl', info.uri, onSuccess, onFailed);
      break;
    default:
      throw 'Unimplemented';
    }
  };

  /**
   * アプリを起動する
   * info.uri: カスタムURI。iOSの場合必須
   * @param {!{uri:?string}} info アプリ情報
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.launchApp = function(info, onSuccess, onFailed) {
    switch (osName) {
    case 'iOS':
    case 'Android':
      callNative('openUrl', info.uri, onSuccess, onFailed);
      break;
    default:
      throw 'Unimplemented';
    }
  };

  /**
   * JM1タッチ判定有効無効設定
   * @deprecated
   * @param {boolean} isEnabled trueなら有効。
   */
  hubea.system.setJm1TouchEnabled = function(isEnabled, onSuccess) {
    callNative('setJm1TouchEnabled', {
      isEnabled: isEnabled
    }, onSuccess);
  };

  /**
   * JM1サーチリスナー設定
   * @deprecated
   * @param {hubea.typedef.Jm1SearchListener} listener JM1サーチリスナー
   */
  hubea.system.setJm1SearchListener = function(listener) {
    jm1SearchListener = listener;
  };

  /**
   * JM1発火
   * @param {string} productId
   * @param {string=} serviceUuid
   */
  hubea.system.fireJm1 = function(productId, serviceUuid) {
    callNative('fireJm1', {
      productId: productId,
      serviceUuid: serviceUuid
    });
  };

  /**
   * Beaconレンジングリスナー設定
   * @deprecated
   * @param {hubea.typedef.BeaconRangingListener} listener Beaconレンジングリスナー
   */
  hubea.system.setBeaconRangingListener = function(listener) {
    beaconRangingListener = listener;
    callNative('listenBeaconRanging', beaconRangingListener ? true : false);
  };

  /**
   * 圏内にあるビーコンを取得する。
   * 返される配列の順番は不定。
   *
   * args.typeはRawのみサポート。
   * Raw : 当該シナリオに関連する全てのビーコン情報を取得する。成りすまし防止等は一切考慮されず検知したものをそのまま返す。
   *
   * proximity - 0:unknown 1:immediate 2:near 3:far
   * lastReceived - 最後にUnknown以外の状態を確認した時間。EPOCからのミリ秒の整数値
   *
   * @param {{type:number}} args
   * @param {function(Array<{
   *     proximityUuid:string,
   *     major:number,
   *     minor:number,
   *     proximity:number,
   *     rssi:number,
   *     lastReceived:number
   *   }>)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.getNearbyBeacons = function(args, onSuccess, onFailed) {
    callNative('system.getNearbyBeacons', args, onSuccess, onFailed);
  };

  /**
   * 起動元のサービスUUIDを取得する
   */
  hubea.system.getServiceUuid = function(onSuccess) {
    callNative('getServiceUuid', '', onSuccess);
  };

  /**
   * nativeの障害情報を取得する
   * @param {Object} args 引数。現在は未使用。
   * @param {function(!{
   *     infos:Array<{
   *       code:number
   *     }>
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.getFailureInfo = function(args, onSuccess, onFailed) {
    hubea.callNative('system.getFailureInfo', args, onSuccess, onFailed);
  };

  // hubea.jsのパスを取得
  var __getHubeaJsPath = (function() {
    var ownPath;
    if (document.currentScript) {
      ownPath = document.currentScript.src;
    } else {
        var scripts = document.getElementsByTagName('script'),
        script = scripts[scripts.length - 1];
        if (script.src) {
          ownPath = script.src;
        }
    }
    if (ownPath) {
      var i = ownPath.lastIndexOf('/');
      if (0 <= i) {
        return ownPath.slice(0, i + 1);
      }
      return '';
    }
  })();

  // エラー情報取得
  function __getHubeaSystemErrorInfo(no) {
    switch(no) {// code は仮
    case 1:  if (osName === 'Android') {
              var locationErrorLabel = { en: 'Please allow Location Service', ja: '位置情報サービスを許可してください' };
              var locationErrorDesc = { en: 'Location Service is disabled', ja: '位置情報サービスが無効です' };
             } else if (osName === 'iOS') {
              var locationErrorLabel = { en: 'Location Service is disabled', ja: '位置情報サービスが無効です'  };
              var locationErrorDesc = { en: 'Turn on location services to find IoTIZR and address around you.\nWhen you want to set up IoTIZR around you, please select ”Always Allow.',
                                        ja: '周辺のIoTIZRと住所の検索に位置情報を使用します。周辺のIoTIZRの設定を行う場合には位置情報サービスを「常に許可」に選択してください。'
                                      };
             }
             return { code: -1,
                      id: '__hubea_err_location_service',
                      label: locationErrorLabel,
                      desc:  locationErrorDesc
                    };
    case 2:  return { code: -2,
                      id: '__hubea_err_network',
                      label: { en: 'Internet connection', ja: 'インターネット接続' },
                      desc:  //{ en: 'Enable Network connection', ja: 'インターネット接続を有効にしてください' }
                             { en: 'No Internet connection', ja: 'インターネット未接続' }
                    };
    case 3:  return { code: -3,
                      id: '__hubea_err_bluetooth',
                      label: { en: 'Bluetooth', ja: 'Bluetooth' },
                      desc:  //{ en: 'Enable Bluetooth', ja: 'Bluetoothを有効にしてください' }
                             { en: 'Bluetooth is disabled', ja: 'Bluetoothが無効です' }
                    };
    case 4:  return { code: -5,
                      id: '__hubea_err_location_service_whereinuse',
                      label: { en: 'Please set Location Service as "Always"', ja: '位置情報サービスを「常に許可」で設定してください。' },
                      desc:  //{ en: 'Allow Location service', ja: '位置情報サービスを許可してください' }
                             { en: 'Location Service is not "Always". \nIn order to search and set the surrounding IoTIZR, it is necessary to set Location Service as "Always".',
                               ja: '位置情報サービスが「常に許可」ではありません。\n周囲のIoTIZRの検索や設定のために位置情報サービスを「常に許可」で設定する必要がございます。'
                             }
    };
    default: return null;
    }
  }
  // エラー通知ブロックを追加
  function __addBlockForHubeaSystemError(errBlock) {
    var guidance = {
      en: 'Please turn the settings on. Click Here For More Information.',
      ja: '設定を有効にしてください。詳細はこちらをタップしてください。'
    };
    var html = '<div class="hubea_notice_header '+ osName +'" id="__hubea_notice_header">'+
               '  <img id="__hubea_notice_mark">'+ guidance[lang] +'<span id="__hubea_notice_close">✕</span>'+
               '</div>';
    for (var no = 1; no <= 4; no++) {
      var noticeInfo = __getHubeaSystemErrorInfo(no);
      if (noticeInfo) {
        html += ('<div class="hubea_notice_item" id="'+ noticeInfo.id +'" data-code="'+ noticeInfo.code +'">'+
                   noticeInfo.label[lang] +
                 '</div>');
      }
    }
    errBlock.innerHTML = html;
    document.getElementsByTagName('body')[0].appendChild(errBlock);
  }
  // エラー通知ブロックの外部cssへの linkタグを追加
  function __addStylesForHubeaSystemError() {
    var errBlockStylesId = '__hubea_err_block_styles';
    var errBlockStyles = document.getElementById(errBlockStylesId);
    if (!errBlockStyles) {
      errBlockStyles = document.createElement('link');
      if (errBlockStyles) {
        errBlockStyles.id = errBlockStylesId;
        errBlockStyles.setAttribute('rel', 'stylesheet');

        var path = (__HUBEA_JS_PATH || '');
        errBlockStyles.setAttribute('href', path +'hubea.systemError.css');
        document.getElementsByTagName('head')[0].appendChild(errBlockStyles);
      }
    }
  }
  // エラー個々の表示／非表示
  function __setHubeaSystemErrorVisibility(infos) {
    for (var no = 1; no <= 4; no++) {
      var noticeInfo = __getHubeaSystemErrorInfo(no);
      if (noticeInfo) {
        var hasError = false;
        if (infos) {
          for (var i = 0; i < infos.length; i++) {
            if (infos[i].code === noticeInfo.code) {
              hasError = true;
              break;
            }
          }
        }
        var item = document.getElementById(noticeInfo.id);
        if (item) {
          item.style.display = (hasError ? 'inline-block' : 'none');
        }
      }
    }
  }
  // エラー内容のモーダルダイアログ表示
  function __show_error_descriptions() {
    var errBlock = document.getElementById('__hubea_err_block');
    if (!errBlock) return;
    var desc = '';
    for (var no = 1; no <= 4; no++) {
      var noticeInfo = __getHubeaSystemErrorInfo(no);
      if (noticeInfo) {
        var item = document.getElementById(noticeInfo.id);
        if (item && item.style.display === 'inline-block') {// エラーあり
          if (0 < desc.length) {
            desc += '\n';
          }
          desc += ('- '+ noticeInfo.desc[lang]);
        }
      }
    }
    if (0 < desc.length) {
      var title = { en: 'Confirmation', ja: '確認' };
      var positive = { en: 'Close', ja: '閉じる' };
      var args = {
        title: title[lang],
        message: desc,
        positive: positive[lang]
      };
      hubea.callNative('system.activity.showAlertDialog', args, function(){});
    }
  }
  // エラーブロック表示／非表示
  function __updateHubeaSystemErrorVisibility(infos) {
    var errBlockId = '__hubea_err_block';
    var errBlock = document.getElementById(errBlockId);
    var status = 'hidden';
    if (Array.isArray(infos) && 0 < infos.length) {
    // Todo 暫定的にエラーブロックは常に非表示とする（HARPS-584）
      // 一つ以上のエラーがあるなら
//      status = 'visible';

      if (!errBlock) {  //初回ならブロックを作って非表示で追加
        errBlock = document.createElement('div');
        errBlock.id = errBlockId;
        errBlock.style.position = 'absolute';
        errBlock.style.display = 'none';
        // エラーブロックを bodyに追加
        __addBlockForHubeaSystemError(errBlock);

        setTimeout(function() {
          // xボタン → 閉じる
          var closeButton = document.getElementById('__hubea_notice_close');
          if (closeButton) {
            closeButton.addEventListener("click", function(event) {
              errBlock.setAttribute('data-never', true);
              event.preventDefault();
            }, false);
          }
          // エラーブロック → エラー内容をダイアログ表示
          var errBlock = document.getElementById('__hubea_err_block');
          if (errBlock) {
            errBlock.addEventListener("click", function(event) {
              __show_error_descriptions();
              event.preventDefault();
            }, false);
          }
        }, 0);
      }

      __setHubeaSystemErrorVisibility(infos);
      var never = errBlock.getAttribute('data-never');
      if (!never && status == 'visible') {
        errBlock.style.display = 'block';
        setTimeout(function() {
          errBlock.classList.add('show');
        }, 0);
      } else {
        errBlock.style.display = 'none';
        errBlock.classList.remove('show');
      }
    } else {
      // エラーがなければ
      __setHubeaSystemErrorVisibility(null);
      if (errBlock) {
        if (errBlock.getAttribute('data-never')) {
          errBlock.removeAttribute('data-never');
        }
        errBlock.style.display = 'none';
        errBlock.classList.remove('show');
      }
    }
  }

  /**
   * デフォルトの障害情報処理の有効/無効化。
   * @param {boolean} isEnabled trueなら有効。
   */
  hubea.system.enableDefaultFailureHandler = (function() {
    if (!__HUBEA_JS_PATH) {
      __HUBEA_JS_PATH = __getHubeaJsPath;
    }
    var intervalId;
    return function(isEnabled) {
      if (isEnabled) {
        if (!intervalId) {
          // hubea.jsが loadされたばかり（＝ネットワークが使える）なこの時点で
          // 外部cssへのlinkタグを headに追加しておく
          __addStylesForHubeaSystemError();

          intervalId = setInterval(function() {
            hubea.system.getFailureInfo({}, function(res) {
              __updateHubeaSystemErrorVisibility(res && res.infos ? res.infos : null);
            });
          }, 1000);
        }
      } else {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
          var errBlock = document.getElementById('__hubea_err_block');
          if (errBlock && errBlock.style.display !== 'none') {
            __updateHubeaSystemErrorVisibility(null);// 隠す
          }
        }
      }
    };
  })();

  /**
   * Notificationを設定する。
   * args.time - EPOCからのミリ秒の整数値
   * args.sound - 0:サイレント (0のみサポート)
   * @param {!{title:string, text:string, time:number, sound:number, url:string}} args
   * @param {function(string)} onSuccess 引数はid
   * @param {Function=} onFailed
   */
  hubea.system.notification.register = function(args, onSuccess, onFailed) {
    callNative('system.notification.register', args, onSuccess, onFailed);
  };

  /**
   * Notificationを解除する。
   * @param {!{id:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.notification.cancel = function(args, onSuccess, onFailed) {
    callNative('system.notification.cancel', args, onSuccess, onFailed);
  };

  /**
   * Audio FileのPickerを起動する。
   * @param {!{title:string}} args
   * @param {function(?{title:string, uri:string})} onSuccess 選択をキャンセルされた場合は引数がnull
   * @param {Function=} onFailed
   */
  hubea.system.picker.pickAudio = function(args, onSuccess, onFailed) {
    callNative('system.picker.pickAudio', args, onSuccess, onFailed);
  };

  /**
   * Geolocation API クローン。
   * ただし、ユーザー許諾は不要。
   * timeout <= 0 のみサポート。
   * キャッシュされた位置情報を取得するのみ。
   */
  hubea.system.getCurrentPosition = function(onSuccess, onError, args) {
    if (typeof args.timeout != 'number' || args.timeout > 0) { throw 'Unsupported'; }
    callNative('getCurrentPosition', args, onSuccess, onError);
  };

  /**
   * 最後の発火時刻を取得する。
   * 発火時刻は全シナリオ中の最後の発火時刻。
   *
   * 発火時刻はEpochからのミリ秒整数値で返す。
   * 不明な場合は0を返す。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function({latestFireDate:number})} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.getLatestFireDate = function(args, onSuccess, onFailed) {
    callNative('system.getLatestFireDate', args, onSuccess, onFailed);
  };

  /**
   * デバイス情報を取得する
   * @param {string} serviceUuid 取得対象のサービスUUID
   * @param {function(string)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.device.getInfo = function(serviceUuid, onSuccess, onFailed) {
    callNative('deviceGetInfo', serviceUuid, onSuccess, onFailed);
  };

  /**
   * デバイスに接続する
   * args.serviceUuid コネクト対象のサービスUUID
   * args.withPairing ペアリングしていない場合にペアリングも行う。省略時は行わない
   * @param {!{serviceUuid:string, withPairing:(boolean|undefined)}} args
   * @param {Function} onSuccess
   * @param {Function=} onFailed
   */
  hubea.device.connect = function(args, onSuccess, onFailed) {
    callNative('deviceConnect', args, onSuccess, onFailed);
  };

  /**
   * デバイスとの接続を切る
   * @param {number} id コネクトID
   */
  hubea.device.disconnect = function(id) {
    callNative('deviceDisconnect', id);
  };

  /**
   * デバイスにデータを送る
   * args.id コネクトID
   * args.data 送信データ。バイナリ
   * @param {!{id:number, data:string}} args
   */
  hubea.device.send = function(args, onSuccess, onFailed) {
    callNative('deviceSend', args, onSuccess, onFailed);
  };

  /**
   * ローカルログ取得。
   * 当該サービスのローカルログのみを扱う。
   * 他のサービスのローカルログは見ることも操作することもできない。
   * range.from 開始日時。undefined or nullなら最も古いものから
   * range.to 終了日時。undefined or nullなら最も新しいものまで
   * @param {!{from:(Date|null|undefined), to:(Date|null|undefined)}} range
   */
  hubea.service.getLocalLogs = function(range, onSuccess, onError) {
    if (!range) { throw 'Unsupported'; }
    callNative('getLocalLogs', range, onSuccess, onError);
  };

  /**
   * ローカルログ削除。
   * 当該サービスのローカルログのみを扱う。
   * 他のサービスのローカルログは見ることも操作することもできない。
   * @param {Array<number>} ids nativeでログレコードを管理するためのIDの配列
   */
  hubea.service.removeLocalLogs = function(ids) {
    if (!ids) { throw 'Unsupported'; }
    callNative('removeLocalLogs', ids);
  };

  /**
   * DOMがロードされていない、かつhubea変数が初期化されていなくても実行可能な初期化コード。
   * また、hubea変数を使用される前に初期化しなくてはいけないコード。
   */
  (function() {
    var userAgent = navigator.userAgent;
    var isIPhone = (userAgent.indexOf('iPhone') > 0);
    var isIPad = (userAgent.indexOf('iPad') > 0);
    var isIPod = (userAgent.indexOf('iPod') > 0);
    // https://stackoverflow.com/questions/57776001/how-to-detect-ipad-pro-as-ipad-using-javascript
    var isIPadOS = navigator.maxTouchPoints &&
      navigator.maxTouchPoints > 2 &&
      /MacIntel/.test(navigator.platform);
    var isIos = (isIPhone || isIPad || isIPod || isIPadOS);
    var isAndroid = (userAgent.indexOf('Android') > 0);

    if (isIos) {
      osName = 'iOS';
      callNativeImpl = callNativeImplIos;
    } else if (isAndroid) {
      osName = 'Android';
      callNativeImpl = callNativeImplAndroid;
    } else {
      callNativeImpl = callNativeImplPc;
    }
    switch (navigator.platform) {
    case 'Win32':
    case 'Win64':
    case 'MacIntel':
      // PC上のエミュレータ
      isOnPc = true;
      log = function(msg) {
        console.log(msg); // ログを差し替え
      };
      break;
    default:
      isOnPc = false;
      break;
    }

    // FIXME: Android4.3はcryptoがサポートされてない
    if (window.crypto) {
      var buf = new Uint8Array(8);

      window.crypto.getRandomValues(buf);
      iframeParams.myToken = window.btoa(unescape(encodeURIComponent(String.fromCharCode.apply(null, buf))));
    }

    /**
     * iframeのイベント入口
     */
    window.addEventListener('message', function(evt) {
      var params = JSON.parse(evt.data);

      /** @suppress {checkTypes} */
      (function() {
        if (params.token == iframeParams.myToken) {
          hubea.event.post(params.id, params.args, params.isSuccess);
        }
      })();
    });

    /**
     * ページ非表示タイミングをnativeに伝える
     */
    window.addEventListener('pagehide', function(evt) {
      callNative('pagehide', null);
    });
  })();

  (function() {
    var loaded = false;

    if (document.readyState == 'complete') {
      // hubea変数がまだ初期化されていないので
      setTimeout(function() {
        initialize();
      }, 0);
    } else {
      document.addEventListener('DOMContentLoaded', onInit);
      window.addEventListener('load', onInit);
    }

    function onInit() {
      document.removeEventListener('DOMContentLoaded', onInit);
      window.removeEventListener('load', onInit);
      if (!loaded) {
        loaded = true;
        initialize();
      }
    }

    /**
     * DOMがロードされた後に実行可能な初期化コード。
     * nativeの呼び出しはiframeの追加を伴うのでDOMロード後でないとダメ。
     */
    function initialize() {

      callNative('_domInitialized', null);

      /**
       * hubea4+向け。
       */
      hubea.system.getInfo(function(result) {
        if (result.isOnHubea && result.hubeaInfo && (
            (result.hubeaInfo.type == 'Old hubea' && parseInt(result.hubeaInfo.versionCode, 10) >= 4) ||
            (result.hubeaInfo.type == 'hubea for Android' && parseInt(result.hubeaInfo.versionCode, 10) >= 100))) {
          /**
           * window.open上書き。
           * 引数はurl以外無視。
           * 返り値は常に現在のwindow
           * @suppress {checkTypes}
           * @param {string} url
           */
          window.open = function(url) {
            hubea.system.activity.start({
              url: url
            });
            return {};
          };

          /**
           * window.close上書き。
           * 引数に戻り値追加。
           * args or args.resultがObjectでなければ戻り値無しと扱う
           * @param {?{result:*}=} args
           */
          window.close = function(args) {
            hubea.system.activity.finish(args);
          };

          /**
           * window.history.back上書き。
           * 引数に戻り値追加。
           * args or args.resultがObjectでなければ戻り値無しと扱う
           * @suppress {checkTypes}
           * @param {?{result:*}=} args
           */
          window.history.back = function(args) {
            hubea.system.activity.back(args);
          };

          /*
           * aタグの動作上書き。
           * この時点で存在しないaタグには対応できないので注意。
           */
          forEach(document.getElementsByTagName('a'), function(elem, index) {
            elem.addEventListener('click', onAnchorClick);
          });
        }

        // readyでオーバーライドできるようにreadyの前に処理
        lang = (navigator.language && navigator.language.slice(0, 2) == 'ja' ? 'ja' : 'en');
        hubea.system.enableDefaultFailureHandler(true);

        callNative('_beforeReady', null);

        isInitialized = true;
        forEach(readyCallbacks, function(elem, index) {
          doCallback(elem);
        });
        readyCallbacks = [];

        callNative('_afterReady', null);

        function onAnchorClick(evt) {
          var currentTarget = evt.currentTarget;
          var href = currentTarget.getAttribute('href');
          var target = currentTarget.getAttribute('target') || '_self';

          switch (target) {
          case '_blank':
          default:
            return true; // default動作は実装に任せる
          case '_hb_new_stack':
            evt.preventDefault();
            hubea.system.activity.start({
              url: href
            });
            break;
          case '_self':
            evt.preventDefault();
            hubea.system.activity.load({
              url: href
            });
            break;
          case '_parent':
          case '_top':
            evt.preventDefault();
            throw ('Unsupported target: ' + target);
            break;
          }
          return false;
        }
      });
    }
  })();
})();

//##### util.js #####

(function() {

  /**
   * 絶対パスを取得する。
   */
  hubea.util.absolutePath = function(path) {
    var elem = document.createElement('span');

    elem.innerHTML = '<a href="' + path + '" />';
    return elem.firstChild.href;
  };

  hubea.util.parseUrl = function(url) {
    var elem = document.createElement('a');

    elem.href = url;

    var noParamUrl = elem.protocol + '//';
    var queryParams;
    var fragment;

    if (elem.username) {
      noParamUrl += elem.username;
      if (elem.password) {
        noParamUrl += ':' + elem.password;
      }
      noParamUrl += '@';
    }
    noParamUrl += elem.host + elem.pathname;

    if (elem.search) {
      var params = elem.search.substring(1).split('&');

      queryParams = {};
      for (var i = 0; i < params.length; i++) {
        var keyValue = params[i].split('=');

        queryParams[decodeURIComponent(keyValue[0])] = decodeURIComponent((keyValue[1] || '').replace(/\+/g, ' '));
      }
    }

    if (elem.hash) {
      fragment = decodeURIComponent((elem.hash.substring(1) || '').replace(/\+/g, ' '));
    }

    return {
      absoluteUrl: elem.href,
      protocol: elem.protocol,
      username: elem.username,
      password: elem.password,
      host: elem.host,
      hostname: elem.hostname,
      port: elem.port,
      //origin: elem.origin, ClosureでなぜかWarningが出るためコメントアウト
      pathname: elem.pathname,
      noParamUrl: noParamUrl,
      noQueryUrl: noParamUrl + elem.hash,
      queryParams: queryParams,
      fragment: fragment
    };
  };

  hubea.util.toBase64 = function(src) {
    var data;

    switch (typeof src) {
    case 'string':
      data = unescape(encodeURIComponent(src));
      break;
    case 'object':
      if (src instanceof Uint8Array) {
        data = String.fromCharCode.apply(null, src);
      } else if (Array.isArray(src)) {
        data = String.fromCharCode.apply(null, src);
      } else {
        throw 'Unsupported type';
      }
      break;
    default:
      throw 'Unsupported type';
    }
    return window.btoa(data);
  };

  hubea.util.base64ToByteText = function(base64) {
    return window.atob(base64);
  };

  hubea.util.base64ToText = function(base64) {
    return decodeURIComponent(escape(hubea.util.base64ToByteText(base64)));
  };

  hubea.util.base64ToArray = function(base64) {
    var byteText = hubea.util.base64ToByteText(base64);
    var len = byteText.length;
    var ary = new Array(len);

    for (var i = 0; i < len; i++) {
      ary[i] = byteText.charCodeAt(i);
    }
    return ary;
  };

  /**
   * ポーリングのような繰り返しの処理を行う。
   *
   * repeat(1000, function(handle, times) {
   *   // 繰り返し処理。
   *   // handle: 非同期にrepeatを止めるためのハンドルオブジェクト
   *   // times: 現在の繰り返し回数
   *   // 返り値: handle
   *   //
   *   // 繰り返しを止めるときは以下のいずれかを行う。
   *   // [同期停止]: この関数でnull/undefined以外の返り値を返す
   *   // [非同期停止]: handle.stop()を呼び出す。
   *   // 返り値、handle.stopの引数でdoneにオブジェクトを渡すことができる。
   * }).done(function(res) {
   *   // repeat終了時に呼ばれる。
   *   // res: 繰り返し関数の返り値、またはhandle.stopで渡したオブジェクト
   * });
   *
   * handle.stop、返り値は正常終了としてdoneに繋がる。
   * handle.fail、例外は異常終了としてonfailedに繋がる。
   *
   * 使用例:
   * [同期停止]
   *   hubea.util.repeat(1000, function(handle, times) {
   *     console.log('repeat: ' + JSON.stringify(handle) + ', ' + times);
   *     if (times > 5) {
   *       return {res:1};
   *     }
   *   }).done(function(res) {
   *     console.log('done: ' + JSON.stringify(res));
   *   }).onfailed(function(err) {
   *     console.log('done: ' + JSON.stringify(err));
   *   });
   * [非同期停止]
   *   hubea.util.repeat(1000, function(handle, times) {
   *     console.log('repeat: ' + JSON.stringify(handle) + ', ' + times);
   *     if (times > 5) {
   *       setTimeout(function() {
   *         handle.stop({res:1});
   *       })
   *     }
   *   }).done(function(res) {
   *     console.log('done: ' + JSON.stringify(res));
   *   }).onfailed(function(err) {
   *     console.log('done: ' + JSON.stringify(err));
   *   });
   * [関数外停止]
   *   var handle = hubea.util.repeat(1000, function(handle, times) {
   *     console.log('repeat: ' + JSON.stringify(handle) + ', ' + times);
   *   }).done(function(res) {
   *     console.log('done: ' + JSON.stringify(res));
   *   }).onfailed(function(err) {
   *     console.log('done: ' + JSON.stringify(err));
   *   });
   *   setTimeout(function() {
   *     handle.stop({res:1});
   *   }, 5000);
   *
   * @param {number} interval
   * @param {function({stop:function(*), fail:function(*)}, number)} proc
   * @return {{done:function(function(*)), onfailed:function(function(*))}}
   */
  hubea.util.repeat = function(interval, proc) {
    var doneHandler;
    var errorHandler;
    var isDone = false;
    var times = 0;
    var procStop = function(res, isFailed) {
      if (!isDone) {
        isDone = true;
        clearInterval(intervalId);
        if (isFailed) {
          if (errorHandler) {
            errorHandler(res);
          }
        } else {
          if (doneHandler) {
            doneHandler(res);
          }
        }
      }
    };
    var handle = {
        stop: function(res) {
          procStop(res, false);
        },
        fail: function(res) {
          procStop(res, true);
        },
        done: function(handler) {
          doneHandler = handler;
          return handle;
        },
        onfailed: function(handler) {
          errorHandler = handler;
          return handle;
        }
      };

    var processor = function() {
      if (!isDone) {
        try {
          var res = proc(handle, ++times);
          if (res != null) { // null or undefined
            handle.stop(res);
          }
        } catch (err) {
          handle.fail(err);
        }
      }
    };

    var intervalId = setInterval(processor, interval);

    processor();

    return handle;
  }

})();

//##### service.contents.js #####

/**
 * hubeaコンテンツ用。
 */
(function() {

  /**
   * 現在表示しているコンテンツの情報を取得する。
   *
   * 取得対象は現在アクティブなコンテンツ（呼び出し元自身のバージョン）の情報であって、Web上のlatestのものではない。
   * (たとえそれがすでにダウンロード済み、差し替え処理済であっても)
   *
   * 情報には自身のコンテントコードも含まれる。
   * このため、複数のコンテントコードでコンテンツ自体を共有するようなことも可能なはず。
   * (script内部にコンテントコードを埋め込むようなことを回避できる)
   *
   * 呼び出し元がローカルファイルでは無い(通常のWeb)等この仕様に基づくコンテンツで無い場合はonFailedが返る。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function(!{
   *     info: !{
   *       contentCode:string,
   *       version:number
   *     }
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.service.contents.getContentInfo = function(args, onSuccess, onFailed) {
    hubea.callNative('service.contents.getContentInfo', args, onSuccess, onFailed);
  };

  /**
   * 現在表示しているコンテンツの最新版を登録する。
   *
   * 自身のコンテンツの最新版をnativeに登録する。
   * 登録したからと言ってすぐに表示がアップデートされるようなことは無く、
   * 次回起動時の取得対象として予約されるだけなので、直ちに影響がある訳では無い。
   *
   * このAPI呼び出し後に画面遷移が発生したとしても相対パスの移動になるので表示中のバージョンのまま移動するだけ。
   * あくまでも次回のhubea-file:スキームの解釈時にそうなるという話。
   * 現在表示中のページは古いバージョンということになるが、その破棄はnative側にお任せ。
   *
   * @param {!{downloadId:string, version:number}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.service.contents.registerLatestContent = function(args, onSuccess, onFailed) {
    hubea.callNative('service.contents.registerLatestContent', args, onSuccess, onFailed);
  };

})();

//##### service.hubeaService.js #####

/**
 * hubeaアプリサービス用。
 */
(function() {

  /**
   * hubeaアプリサービスへメッセージをポストする。
   * このAPIはどのサービスからでも使える。
   * ポストしたメッセージは即時に伝わる訳では無く、一旦nativeのストレージに保管され、
   * 次回以降のhubeaアプリサービスの起動後にその画面のルールに従って取得される。
   *
   * このAPIでポストされたメッセージは以下の仕様でhubeaアプリサービスのlocalStorageに格納される。
   *
   * key: 'post: ' + type + ' ' + Date.now() + ' ' + seq-no(3桁。000から。keyがダブった場合にインクリメント)
   * value: value
   *
   * 例:
   *   呼び出し内容:
   *     hubea.service.hubeaService.postMessage({type:'register_device_info', value:'001afb'});
   *   localStorageの格納:
   *     key:'post: register_device_info 23456789 000' value:'001afb'
   *
   * typeに空白文字がある場合はセキュリティ的にエラーとする(native側で)。
   *
   * @param {!{
   *     type:string,
   *     value:string
   *   }} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.service.hubeaService.postMessage = function(args, onSuccess, onFailed) {
    hubea.callNative('service.hubeaService.postMessage', args, onSuccess, onFailed);
  };

})();

//##### service.localStorage.js #####

/**
 * localStorageのhubeaストレージ版+α。
 * ただし、全て非同期処理版となる。
 * サービス毎に独立したKVSを構築する。
 * 容量上限は特に設けない。
 *
 * サービスに紐づかない画面(履歴画面等)の場合は
 * 「hubeaアプリサービス」として一括りにする。
 */
(function() {

  hubea.service.localStorage.getItem = function(key, onSuccess, onFailed) {
    hubea.callNative('service.localStorage.getItem', key, onSuccess, onFailed);
  };

  hubea.service.localStorage.setItem = function(key, data, onSuccess, onFailed) {
    hubea.callNative('service.localStorage.setItem', {
      key: key,
      data: data
    }, onSuccess, onFailed);
  };

  hubea.service.localStorage.removeItem = function(key, onSuccess, onFailed) {
    hubea.callNative('service.localStorage.removeItem', key, onSuccess, onFailed);
  };

  hubea.service.localStorage.clear = function(onSuccess, onFailed) {
    hubea.callNative('service.localStorage.clear', null, onSuccess, onFailed);
  };

  /**
   * 存在するキーを検索する。
   * likeの特殊文字にはワイルドカード'*'のみ使用可能。'?'はとりあえず使用不可。
   * @param {!{like:string}} args
   * @param {function({keys:!Array<string>})} onSuccess
   * @param {Function=} onFailed
   */
  hubea.service.localStorage.queryKeys = function(args, onSuccess, onFailed) {
    hubea.callNative('service.localStorage.queryKeys', args, onSuccess, onFailed);
  };

})();

//##### service.model.scenario.js #####

/**
 * モデル定義。
 * nativeとの接続が非同期なのであまり普通っぽい感じにはできない。
 * 参照は子から親へ行うこと。(通常のDBの構造と同じ)
 * Javascriptなので相互参照はできない(メモリリークする)。
 */
(function() {

  var instance = null;

  /**
   * @constructor
   */
  hubea.service.model.Scenario = function() {
    var self = this;

    /**
     * @type {number}
     */
    self.id = 0;
  };

  /**
   * 対応するシナリオインスタンスを取得する。
   */
  hubea.service.model.Scenario.getInstance = function(onSuccess) {
    if (instance) {
      hubea.doCallback(onSuccess, instance);
    } else {
      getScenario(function(id) {
        if (id) {
          instance = new hubea.service.model.Scenario();
          instance.id = id;
        }
        hubea.doCallback(onSuccess, instance);
      });
    }
  };

  /**
   * 表示中のシナリオIDを取得する。
   * @param {function(number)} onSuccess
   */
  function getScenario(onSuccess) {
    hubea.callNative('model.getScenario', null, onSuccess);
  }

})();

//##### service.model.setting.js #####

/**
 * モデル定義。
 * nativeとの接続が非同期なのであまり普通っぽい感じにはできない。
 * 参照は子から親へ行うこと。(通常のDBの構造と同じ)
 * Javascriptなので相互参照はできない(メモリリークする)。
 */
(function() {

  /**
   * @constructor
   */
  hubea.service.model.Setting = function() {
    var self = this;

    /**
     * @type {number}
     */
    self.id = 0;

    /**
     * @type {hubea.service.model.Scenario}
     */
    self.scenario = null;
  };

  /**
   * 指定シナリオのアクティブなSettingを取得する。
   * @param {!{scenario:hubea.service.model.Scenario}} args
   */
  hubea.service.model.Setting.findActive = function(args, onSuccess, onFailed) {
    hubea.service.model.Scenario.getInstance(function(scenario) {
      if (!args || !args.scenario || args.scenario !== scenario) {
        hubea.doCallback(onFailed, 'Invalid args.scenario');
        return;
      }
      getActiveSetting(function(id) {
        var setting = null;

        if (id) {
          setting = new hubea.service.model.Setting();
          setting.id = id;
          setting.scenario = scenario;
        }
        hubea.doCallback(onSuccess, setting);
      });
    });
  };

  /**
   * 現時点でアクティブなSettingを取得する。
   * @param {function(number)} onSuccess
   */
  function getActiveSetting(onSuccess) {
    hubea.callNative('model.getActiveSetting', null, onSuccess);
  }

})();

//##### system.activity.js #####

(function() {

  /**
   * hubea4+対応のNative実装画面を構築するために必要とするシナリオが取得できなかった。
   * エラーオブジェクトの'result'プロパティに、エラー値(number)が指定される。
   * @const
   */
  hubea.system.activity.ERR_SCENARIO_NOT_AVAILABLE = 'LOC: scenario not available';

  /**
   * 画面スタックに新しい画面を積む。
   * 立ち上げる画面に紐づくシナリオは呼び出し側のものを引き継ぐ。
   * 呼び出し側にシナリオの紐付けが無い場合(お知らせ画面等)はscenarioIdで紐づけるシナリオIDを指定する。
   * シナリオの紐付けが無いのにscenarioIdが指定されていない or シナリオが紐づけられている場合にscenarioIdが指定された場合は例外。
   * @param {!{url:string, scenarioId:(number|undefined)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.start = function(args, onSuccess, onFailed) {
    var urlData = hubea.util.parseUrl(args.url);
    var loadUrl;
    var textParams;

    if (hubea.isManagedUrl(urlData)) {
      loadUrl = urlData.noQueryUrl;
      textParams = JSON.stringify({
        queryParams: urlData.queryParams,
        fragment: urlData.fragment
      });
    } else {
      loadUrl = urlData.absoluteUrl;
      textParams = '';
    }
    var params = {
        url: loadUrl,
        param: textParams
    };
    if (typeof args.scenarioId == 'number') {
      params.scenarioId = args.scenarioId;
    }
    hubea.callNative('system.activity.start', params, onSuccess, onFailed);
  };

  /**
   * 現在の画面を終了しスタックから取り除く。
   * @param {?{result:*}=} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.finish = function(args, onSuccess, onFailed) {
    hubea.callNative('system.activity.finish', {
      result: args ? JSON.stringify(args.result) : ''
    }, onSuccess, onFailed);
  };

  /**
   * 現在の画面にURLをロードする。
   * 現在の画面のパラメータはスタックに保持する。
   * @param {!{url:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.load = function(args, onSuccess, onFailed) {
    var urlData = hubea.util.parseUrl(args.url);
    var loadUrl;
    var textParams;

    if (hubea.isManagedUrl(urlData)) {
      loadUrl = urlData.noQueryUrl;
      textParams = JSON.stringify({
        queryParams: urlData.queryParams,
        fragment: urlData.fragment
      });
    } else {
      loadUrl = urlData.absoluteUrl;
      textParams = '';
    }
    hubea.callNative('system.activity.load', {
      url: loadUrl,
      param: textParams
    }, onSuccess, onFailed);
  };

  /**
   * 現在の画面の直前のURLに戻る。
   * @param {?{result:*}=} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.back = function(args, onSuccess, onFailed) {
    hubea.callNative('system.activity.back', {
      result: args ? JSON.stringify(args.result) : ''
    }, onSuccess, onFailed);
  };

  /**
   * 画面起動パラメータを取得する。
   * 常に自身の起動パラメータが取れる。
   * 自身の起動後に他の画面をstart/loadして戻ってきた後でも。
   * startの場合はインスタンスが違うのであまり関係ないが、
   * loadの場合は同じインスタンス内でパラメータがloadの度にスタックされていくことを想定。
   * @param {Function} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.getParams = function(onSuccess, onFailed) {
    var urlData = hubea.util.parseUrl(window.location.href);

    if (hubea.isOnPc) {
      hubea.doCallback(onSuccess, {
        queryParams: urlData.queryParams,
        fragment: urlData.fragment
      });
    } else {
      hubea.callNative('system.activity.getParams', null, function(param) {
        try {
          param = JSON.parse(param);
        } catch (e) {
          param = {};
        }
        // 二者択一
        param.queryParams = param.queryParams || urlData.queryParams;
        param.fragment = param.fragment || urlData.fragment;
        hubea.doCallback(onSuccess, param);
      }, onFailed);
    }
  };

  /**
   * 直前に終了した画面の戻り値を取得する。
   * パラメータと違いスタックの概念は無いので一つだけ記憶していればいいはず。
   * @param {Function} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.getResult = function(onSuccess, onFailed) {
    if (hubea.isOnPc) {
      hubea.doCallback(onSuccess, null); // PCではエミュレートできない
    } else {
      hubea.callNative('system.activity.getResult', null, function(param) {
        try {
          param = JSON.parse(param);
        } catch (e) {
          param = {};
        }
        hubea.doCallback(onSuccess, param);
      }, onFailed);
    }
  };

  /**
   * AlertDialog(モーダル)を表示する。
   *
   * argsでundefinedの項目は(可能なら)エリア自体を非表示とする。
   * タイトル領域を表示しない、等。
   * positive、negativeは1つ指定された場合は1ボタン、両方指定された場合は2ボタンのDialogが表示される。
   * 1つは必ず指定すること。
   *
   * resultは押されたボタンによって以下の文字列を返す。
   * positive - 'positive'
   * negative - 'negative'
   * それ以外 - 'unknown'
   * それ以外というのはnativeの仕様で外領域タップ等ボタン押下以外の消去方法がある場合に指定される。
   * その場合にどうするかはコンテンツ次第。
   *
   * ユーザーの選択結果は全てonSuccessで通知される。
   * onFailedはシステム上の何らかのエラーが発生したような場合のみに使用。
   *
   * @param {!{
   *     title:(string|undefined),
   *     message:(string|undefined),
   *     positive:(string|undefined),
   *     negative:(string|undefined)
   *   }} args
   * @param {function(!{
   *     result:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.activity.showAlertDialog = function(args, onSuccess, onFailed) {
    hubea.callNative('system.activity.showAlertDialog', args, onSuccess, onFailed);
  };

})();

//##### system.net.js #####

/*
 * ネットワーク系に関する実装
 */
(function() {

  /**
   * 現在アクティブなネットワークの情報を取得する。
   *
   * といってもサポートするのはWiFi接続中の場合にSSIDが取れるだけ。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function(!{
   *     ssid:(string|undefined)
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.net.getNetworkInfo = function(args, onSuccess, onFailed) {
    hubea.callNative('system.net.getNetworkInfo', args, onSuccess, onFailed);
  };

  /**
   * 指定したURLからデータをダウンロードする。
   *
   * 大きめのファイル、バイナリ等、jsで直接扱うのは憚られるようなデータをダウンロードし、かつNative側と共有するための機能。
   * ダウンロードしたデータはUUID等汎用的にユニークな構造を持つ"ダウンロードID"で管理される。
   * 管理データは[JM1クローズ保証]と同じタイミングで破棄される。
   * 保存するべきデータは他の何らかの関数と連携して何かしらの処理を行うことを想定する。
   *
   * "settings"はオプション。
   * jQuery.ajaxのsettingsど同等を想定。
   * ただし現時点で対応するのはhubea認証用にsettings.headers、かつhubea認証用ヘッダの追加のみ。
   *
   * @param {!{url:string, settings:(Object|undefined)}} args
   * @param {function(!{
   *     downloadId:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.system.net.downloadData = function(args, onSuccess, onFailed) {
    hubea.callNative('system.net.downloadData', args, onSuccess, onFailed);
  };

})();

//##### system.net.socket.js #####

/*
 * Socket
 */
(function() {

  /** @const */ hubea.system.net.socket.ERR_IO = 'LOC: io';
  /** @const */ hubea.system.net.socket.ERR_EOF = 'LOC: eof';

  var socketData = {};

  /**
   * Socketをオープンする。
   *
   * args.host 接続先のホスト名
   * args.port 接続先のポート番号
   *
   * socketIdはJM1クローズ保証の対象となる。
   * ロック画面も含み実行中のWebViewが裏に回ったら強制的に開放される。
   *
   * IOエラーが発生した場合は、
   * onFailed({code:ERR_IO, message:"<よしなに>"})
   *
   * @param {!{host:string, port:number}} args
   * @param {function(!{
   *     socketId:string
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.open = function(args, onSuccess, onFailed) {
    hubea.callNative('system.net.socket.open', args, function(res) {
      socketData[res.socketId] = {
        dataArray: [],
        totalLength: 0,
        err: undefined
      };
      hubea.doCallback(onSuccess, res);
    }, onFailed);
  };

  /**
   * Socketをクローズする。
   *
   * args.socketId ソケットID
   *
   * IOエラーが発生した場合は、
   * onFailed({code:ERR_IO, message:"<よしなに>"})
   *
   * @param {!{socketId:string}} args
   * @param {Function=} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.close = function(args, onSuccess, onFailed) {
    delete socketData[args.socketId];
    hubea.callNative('system.net.socket.close', args, onSuccess, onFailed);
  };

  /**
   * Socketにデータを送信する。
   *
   * args.socketId ソケットID
   * args.data 送信データ(Base64)
   *
   * IOエラーが発生した場合は、
   * onFailed({code:ERR_IO, message:"<よしなに>"})
   *
   * @param {!{socketId:string, data:string}} args
   * @param {Function=} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.write = function(args, onSuccess, onFailed) {
    hubea.callNative('system.net.socket.write', args, onSuccess, onFailed);
  };

  /**
   * Socketからデータを受信する。
   *
   * args.socketId ソケットID
   *
   * 受信データはnativeにバッファされていて、このAPIではそのバッファにたまっている内容を取得するだけ。
   * バッファから取るだけなのでIOエラーは発生しない。
   * その代り、バッファにデータが無く、かつエラー等によりソケットが閉じている場合はERR_EOFとなる。
   * onFailed({code:ERR_EOF, message:"<よしなに>"})
   *
   * @param {!{socketId:string}} args
   * @param {function(!{
   *     data:string
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.read = function(args, onSuccess, onFailed) {
    hubea.callNative('system.net.socket.read', args, onSuccess, onFailed);
  };

  /**
   * 符号あり32ビット値を取得する。
   *
   * @param {!{socketId:string}} args
   * @param {function(!{
   *     data:number,
   *     available:number
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.readInt = function(args, onSuccess, onFailed) {
    hubea.system.net.socket.readFully({socketId:args.socketId, length:4}, function(res) {
      try {
        var byteText = res.data;
        var c1 = byteText.charCodeAt(0);
        var c2 = byteText.charCodeAt(1);
        var c3 = byteText.charCodeAt(2);
        var c4 = byteText.charCodeAt(3);
        // Javascriptではビット演算は32ビットsignedで行われるのでこれで正しい
        var num = ((c1 << 24) | (c2 << 16) | (c3 << 8) | (c4));

        hubea.doCallback(onSuccess, {
          data:num,
          available:res.available
        });
      } catch (err) {
        hubea.doCallback(onFailed, {
          code:hubea.ERR_UNKNOWN,
          err:err,
          message:'ERR_UNKNOWN'
        });
      }
    }, onFailed);
  };

  /**
   * 符号無し32ビット値を取得する。
   *
   * @param {!{socketId:string}} args
   * @param {function(!{
   *     data:number,
   *     available:number
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.readUnsignedInt = function(args, onSuccess, onFailed) {
    hubea.system.net.socket.readInt({socketId:args.socketId}, function(res) {
      hubea.doCallback(onSuccess, {
        // signedを0ビット符号なし右シフトするとUnsignedになる
        data:(res.data >>> 0),
        available:res.available
      });
    }, onFailed);
  };

  /**
   * UTF8文字列を取得する。
   * lengthで指定したバイト数のUTF8文字列を読み込み、Javascriptの文字列に変換する。
   * なのでlengthと返ってくる文字数は必ずしも同じではない。
   *
   * @param {!{socketId:string, length:number}} args
   * @param {function(!{
   *     data:string,
   *     available:number
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.readText = function(args, onSuccess, onFailed) {
    hubea.system.net.socket.readFully({socketId:args.socketId, length:args.length}, function(res) {
      try {
        var byteText = res.data;
        var escaped = escape(byteText);
        var text = decodeURIComponent(escaped);

        hubea.doCallback(onSuccess, {
          data:text,
          available:res.available
        });
      } catch (err) {
        hubea.doCallback(onFailed, {
          code:hubea.ERR_UNKNOWN,
          err:err,
          message:'ERR_UNKNOWN'
        });
      }
    }, onFailed);
  };

  /**
   * lengthが指定されている場合はその分データが受信できるまでブロック(コールバックを返さない)する。
   * lengthは0でもOK。その場合、空データが返る。availableだけ取りたい場合に使える。
   * lengthがundefinedの場合はバッファにあるデータ全て取得する、の意となる。
   *
   * 返り値のdataはBase64ではなく、バイト文字列なので注意。
   *
   * @param {!{socketId:string, length:(number|undefined)}} args
   * @param {function(!{
   *     data:string,
   *     available:number
   *   })} onSuccess
   * @param {function(!{
   *     code: string,
   *     message: string
   *   })=} onFailed
   */
  hubea.system.net.socket.readFully = function(args, onSuccess, onFailed) {
    try {
      var data = socketData[args.socketId];

      hubea.util.repeat(100, function(handle, times) {
        // IOのエラーがある場合はバッファのデータが十分にある限りは通常処理。
        // エラー発生は先送り。
        if (data.err === undefined) {
          // nativeのバッファの健全化のため、必ず1回はnativeからデータを吸い上げる
          hubea.system.net.socket.read({
            socketId: args.socketId
          }, function(res) {
            try {
              if (res.data) {
                var byteText = hubea.util.base64ToByteText(res.data);

                data.dataArray.push(byteText);
                data.totalLength += byteText.length;
              }
              if (data.totalLength >= args.length) {
                // 充分な読み込みデータが溜まったので終わり
                handle.stop('OK');
              }
            } catch (err) {
              // これはIOに関係ないエラーなのでfailとする
              handle.fail(err);
            }
          }, function(err) {
            data.err = err;
            handle.stop(err);
          });
        } else {
          return data.err;
        }
      }).done(function(res) {
        var result;

        // length指定なし
        if (args.length === undefined) {
          if (data.totalLength > 0) {
            // バッファにデータがあればデータを全て返す
            result = readAndDelete(data.totalLength);
          } else {
            // バッファにデータが無い
            if (data.err === undefined) {
              // エラーが発生してなければ空文字列を返す
              result = '';
            } else {
              // エラーが発生していればエラーを返す
              hubea.doCallback(onFailed, {
                code:hubea.system.net.socket.ERR_EOF,
                message:'ERR_EOF'
              });
              return;
            }
          }
        // length指定あり
        } else {
          if (data.totalLength >= args.length) {
            // バッファのデータが足りていれば指定長分返す
            result = readAndDelete(args.length);
          } else {
            // データが足りない場合はエラーが発生した場合のはず
            hubea.doCallback(onFailed, {
              code:hubea.system.net.socket.ERR_EOF,
              message:'ERR_EOF'
            });
            return;
          }
        }
        hubea.doCallback(onSuccess, {
          data:result,
          available:data.totalLength
        });

        // データ量は足りている前提
        function readAndDelete(length) {
          var result = '';
          var remain = length;

          while (remain > 0) {
            var byteText = data.dataArray[0];

            if (remain >= byteText.length) {
              remain -= byteText.length;
              result += byteText;
              data.dataArray.shift();
            } else {
              var outText = byteText.substring(0, remain);
              var newByteText = byteText.substring(remain);

              remain = 0;
              result += outText;
              data.dataArray[0] = newByteText;
            }
          }
          data.totalLength -= length;
          return result;
        }
      }).onfailed(function(err) {
        hubea.doCallback(onFailed, {
          code:hubea.ERR_UNKNOWN,
          err:err,
          message:'ERR_UNKNOWN'
        });
      });
    } catch (err) {
      hubea.doCallback(onFailed, {
        code:hubea.ERR_UNKNOWN,
        err:err,
        message:'ERR_UNKNOWN'
      });
    }
  };

  // テストコード
  /*
  if (true && hubea['isOnPc']) {
    (function() {
      var logDebug = function(msg) {
        console.log(msg);
      };
      var logResult = function(msg) {
        console.log(msg);
      };
      var assert = function(exp) {
        if (!exp) {
          throw exp;
        }
      };
      // stubs
      (function() {
        var serverData = {};
        hubea.system.net.socket.open = function(args, onSuccess, onFailed) {
          var socketId = Date.now().toString();
          serverData[socketId] = {
            testDataArray: args.testDataArray
          };
          socketData[socketId] = {
            dataArray: [],
            totalLength: 0,
            err: undefined
          };
          hubea.doCallback(onSuccess, {socketId:socketId});
        };
        hubea.system.net.socket.close = function(args, onSuccess, onFailed) {
          delete socketData[args.socketId];
          delete serverData[args.socketId];
        };
        hubea.system.net.socket.write = function(args, onSuccess, onFailed) {
          hubea.doCallback(onSuccess);
        };
        hubea.system.net.socket.read = function(args, onSuccess, onFailed) {
          var dataArray = serverData[args.socketId].testDataArray;
          if (dataArray.length > 0) {
            var data = dataArray.shift();
            hubea.doCallback(onSuccess, {data:data});
          } else {
            hubea.doCallback(onFailed, {code:hubea.system.net.socket.ERR_EOF, message:'ERR_EOF'});
          }
        };
      })();
      // tests
      (function() {
        setTimeout(function() {
          testSignedInt();
        });
        function testSignedInt() {
          hubea.system.net.socket.open({
            host: 'hoge',
            port: 4649,
            testDataArray: [
              hubea.util.toBase64([0x01, 0x23, 0x45, 0x67]),
              hubea.util.toBase64([0x89, 0xab]),
              hubea.util.toBase64([0xcd, 0xef, 0x00])
            ]
          }, function(res) {
            var socketId = res.socketId;
            hubea.system.net.socket.readInt({socketId:socketId}, function(res) {
              assert(res.data === 19088743);
              assert(res.available === 0);
              hubea.system.net.socket.readInt({socketId:socketId}, function(res) {
                assert(res.data === -1985229329);
                assert(res.available === 1);
                logResult('readInt: OK');
                setTimeout(function() {
                  testUnsignedInt();
                });
              }, function(err) {
                throw err;
              });
            }, function(err) {
              throw err;
            });
          }, function(err) {
            throw err;
          });
        }
        function testUnsignedInt() {
          hubea.system.net.socket.open({
            host: 'hoge',
            port: 4649,
            testDataArray: [
              hubea.util.toBase64([0x01, 0x23, 0x45, 0x67]),
              hubea.util.toBase64([0x89, 0xab]),
              hubea.util.toBase64([0xcd, 0xef, 0x00])
            ]
          }, function(res) {
            var socketId = res.socketId;
            hubea.system.net.socket.readUnsignedInt({socketId:socketId}, function(res) {
              assert(res.data === 19088743);
              assert(res.available === 0);
              hubea.system.net.socket.readUnsignedInt({socketId:socketId}, function(res) {
                assert(res.data === 2309737967);
                assert(res.available === 1);
                logResult('readUnsignedInt: OK');
                setTimeout(function() {
                  testText();
                });
              }, function(err) {
                throw err;
              });
            }, function(err) {
              throw err;
            });
          }, function(err) {
            throw err;
          });
        }
        function testText() {
          hubea.system.net.socket.open({
            host: 'hoge',
            port: 4649,
            testDataArray: [
              hubea.util.toBase64('あいうab'),
              hubea.util.toBase64('えおcd'),
              hubea.util.toBase64('ef')
            ]
          }, function(res) {
            var socketId = res.socketId;
            hubea.system.net.socket.readText({socketId:socketId, length:11}, function(res) {
              assert(res.data === 'あいうab');
              assert(res.available === 0);
              hubea.system.net.socket.readText({socketId:socketId, length:9}, function(res) {
                assert(res.data === 'えおcde');
                assert(res.available === 1);
                logResult('readText: OK');
              }, function(err) {
                throw err;
              });
            }, function(err) {
              throw err;
            });
          }, function(err) {
            throw err;
          });
        }
      })();
    })();
  }
  */
})();
//##### app.js #####

(function() {

  /**
   * インストールIDを取得する
   */
  hubea.app.getInstallId = function(onSuccess) {
    hubea.callNative('getInstallId', '', onSuccess);
  };

  /**
   * シナリオ詳細画面の表示
   * @param {!{needAppUpdate:(boolean|undefined), scenarioId:number, settingId:number}} scenarioInfo
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.app.showScenarioDetail = function(scenarioInfo, onSuccess, onFailed) {
    hubea.callNative('showScenarioDetail', scenarioInfo, onSuccess, onFailed);
  };

  /**
   * アプリバージョンアップ
   */
  hubea.app.appUpdate = function(onSuccess, onFailed) {
    hubea.callNative('appUpdate', '', onSuccess, onFailed);
  };

  /**
   * WebView画面(通常ビーコンの反応時に表示するもの)を表示。
   * asActivityフラグがtrueである場合はWeb画面スタックとして表示する。
   * 立ち上げるWebViewに紐づくシナリオは呼び出し側のものを引き継ぐ。
   * 呼び出し側にシナリオの紐付けが無い場合(お知らせ画面等)はscenarioIdで紐づけるシナリオIDを指定する。
   * シナリオの紐付けが無いのにscenarioIdが指定されていない or シナリオが紐づけられている場合にscenarioIdが指定された場合は例外。
   * @param {!{url:string, scenarioId:(number|undefined), asActivity:(boolean|undefined)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.app.startWebView = function(args, onSuccess, onFailed) {
    hubea.callNative('app.startWebView', args, onSuccess, onFailed);
  };

  /**
   * お知らせ画面の表示。
   * デフォルトのURLではなく指定されたURLで表示する。
   * お知らせ画面の枠を使って指定URLを表示するイメージ。
   * UserAgent等のポストは指定されたURLに対して通常通り行う。
   * @param {!{url:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.app.showInformationList = function(args, onSuccess, onFailed) {
    hubea.callNative('app.showInformationList', args, onSuccess, onFailed);
  };

  /**
   * サービスマップの表示。
   * lat、lngのいずれかが省略されていれば直前の表示位置のままで表示。
   * zoomが指定されていなければ直前の縮尺で表示。
   * zoomはGoogleMapの単位で指定する。nativeはなるべくそれに近い感じで表示する。
   * markerがtrueの場合は中央にピンを立てる。(lat、lngが指定されていない場合は無視で良い)
   * markerの消去タイミングは画面移動が発生した時、とする。
   * @param {!{lat:(number|undefined), lng:(number|undefined), zoom:(number|undefined), marker:(boolean|undefined)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.app.showServiceMap = function(args, onSuccess, onFailed) {
    hubea.callNative('app.showServiceMap', args, onSuccess, onFailed);
  };

  /**
   * 指定のURLを事前にキャッシュする目的でユーザーに見えない形でロードする。
   * 裏、透明等、nativeの都合の良い形でユーザーに見えないWebViewを表示することを想定。
   * 呼び出すサイトは通常のキャッシュではなくAppCacheを使用していることを前提とする。
   *
   * キャッシュすることが目的なのでJavascriptの初期化コードが実行されることを期待してはいけない。
   * しかし、実行されないことを期待してもいけない。
   *
   * Webのコードでエラーが発生するといけないのでシナリオIDの設定は通常のWebView表示時と同等に行う。
   * 呼び出し側にシナリオの紐付けが無い場合(お知らせ画面等)はscenarioIdで紐づけるシナリオIDを指定する。
   * シナリオの紐付けが無いのにscenarioIdが指定されていない or シナリオが紐づけられている場合にscenarioIdが指定された場合は例外。
   *
   * onSuccessはページ読み込みが完了した場合に呼び出される。
   * そのタイミングは「ページがAppCacheに対応していればキャッシュが行われたはず」という条件を検知できたタイミングで、
   * その直後とは限らない。
   * native側で検知可能なタイミングに依存するのでキャッシュ読み込みとページリソース、初期化処理等全て終わったタイミング
   * (必要最低限のタイミングよりかなり先)ということもあり得る。
   *
   * onSuccessが呼び出されるまでには相当の時間がかかる。
   * その間に起こった事案によって、キャッシュが完了したことが分からなくなる場合もあり得る。
   * (キャッシュされたかもしれないが確定できない、等)
   * その場合、onFailedが呼び出される。
   * なのでonFailedは「キャッシュされていない」ではなく「キャッシュされたかどうか分からない」という意味である。
   *
   * @param {!{url:string, scenarioId:(number|undefined)}} args
   * @param {Function=} onSuccess ページ読み込みが完了した場合に呼び出される
   * @param {Function=} onFailed ページ読み込み完了検知ができないことが確定した場合に呼び出される
   */
  hubea.app.preloadWeb = function(args, onSuccess, onFailed) {
    hubea.callNative('app.preloadWeb', args, onSuccess, onFailed);
  };

})();

//##### security.js #####

(function() {

  /**
   * hubea認証のヘッダを生成する。
   * 返り値のheadersに追加すべきヘッダ群がkey-value形式で入っている。
   * x-hubea-dateの日付はnative側で現在時刻で自動生成する。
   * jQueryの$.ajax()のheadersにそのまま設定できることを想定。
   *
   * native側はargs.contentServiceが指定されていればsignature作成時に組み込む。
   * 指定されていなければ従来通り。
   *
   * args.contentService - 対応サーバがhubeaサーバでない場合は指定する。
   *
   * onSuccessの引数の想定：
   * {
   *   "headers": {
   *     "x-hubea-auth": "<install-id>:<signature>",
   *     "x-hubea-date": "<date>"
   *   }
   * }
   *
   * @param {!{
   *     httpVerb:string,
   *     contentMd5:string,
   *     contentType:string,
   *     path:string,
   *     contentService:(string|undefined)
   *   }} args
   * @param {function({headers:!Object})} onSuccess
   * @param {Function=} onFailed
   */
  hubea.security.createAuthHeaders = function(args, onSuccess, onFailed) {
    hubea.callNative('security.createAuthHeaders', args, onSuccess, onFailed);
  };

})();

//##### jm1.js #####

(function() {

  /*
   * エラーコードの定義はSDKと合わせるためにhubea.jm1.*で共通とする。
   */

  /** @const */ hubea.jm1.ERR_ZE_NOT_FOUND = 'LOC: ZE_NOT_FOUND';
  /** @const */ hubea.jm1.ERR_ZE_NOT_SUPPORTED = 'LOC: ZE_NOT_SUPPORTED';
  /** @const */ hubea.jm1.ERR_ZE_BUSY = 'LOC: ZE_BUSY';

  /**
   * 圏内にあるJM1を取得する。
   * 返される配列の順番は不定。
   * args.types 取得対象のTypeの配列。未指定の場合は全て
   *
   * onSuccessの結果はam1デバイスの場合のみam1プロパティが付加される
   * lastReceived - 最後に状態を確認した時間。EPOCからのミリ秒の整数値
   * productCode - 取得できなかった場合はundefined。オフライン時等。
   * productDesc - 取得できなかった場合はundefined。オフライン時等。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはない。
   * nativeが常に周囲のJM1情報を蓄積しておくのでとの情報を取りに行く。
   *
   * @param {!{types:(Array<number>|undefined)}} args
   * @param {function(Array<!{
   *     serviceUuid:string,
   *     rssi:number,
   *     txPowerLevel:number,
   *     productCode:(string|undefined),
   *     productDesc:(string|undefined),
   *     lastReceived:number,
   *     am1:{
   *         isRegistered:boolean
   *       }
   *   }>)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getNearbyJm1s = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getNearbyJm1s', args, onSuccess, onFailed);
  };

  /**
   * 圏内にあるMemberAssignmentServiceを取得する。
   * 返される配列の順番は不定。
   *
   * lastReceived - 最後に状態を確認した時間。EPOCからのミリ秒の整数値
   * serviceData - ZEObtainResultHandlerのserviceDataをそのままObject化したもの。
   * productCode - 取得できなかった場合はundefined。オフライン時等。
   * productDesc - 取得できなかった場合はundefined。オフライン時等。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはないが、
   * ZEUtility::obtainMemberAssignmentServiceWithHandlerBlock:option
   * の収集結果をプールしてて、それを返す。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function(Array<!{
   *     jm1UniqId:number,
   *     serviceData:!Object,
   *     rssi:number,
   *     txPowerLevel:number,
   *     productCode:(string|undefined),
   *     productDesc:(string|undefined),
   *     lastReceived:number
   *   }>)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getNearbyMemberAssignmentServices = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getNearbyMemberAssignmentServices', args, onSuccess, onFailed);
  };

  /**
   * 当該シナリオに関連して受信した Aplix Notification を取得する。
   * 返される配列の順番は受信日時の降順。
   *
   * args.jm1UniqId - 取得対象とするデバイスの JM1 unique ID。ZEROパディングの大文字8桁16進数。
   * args.notificationUUID - 取得対象とする Notification UUID の配列。未指定の場合は全て。
   *                         暗号化されている Notification の場合、これを指定すると復号化前の
   *                         Notification は配列に含まれなくなる。
   *
   * aplixNotification.encrypted - データが暗号化されており復号化されていない場合は true
   * aplixNotification.jm1UniqId - Aplix Notification を送信したデバイスの JM1 unique ID
   * aplixNotification.notificationIndex - encrypted が true の場合は undefined
   * aplixNotification.notificationType - encrypted が true の場合は undefined
   * aplixNotification.data - encrypted が true の場合は暗号化された Payload 全体(Base64)
   *                          そうでなければ Customer Specific Data(Base64)
   * lastReceived - 受信した時刻。EPOCからのミリ秒の整数値
   *
   * @param {{jm1UniqId:(string|undefined), notificationUUID:?Array<string>}} args
   * @param {function(Array<{
   *     aplixNotification:{
   *       encrypted:(boolean|undefined),
   *       jm1UniqId:string,
   *       notificationUUID:(string|undefined),
   *       notificationIndex:(number|undefined),
   *       notificationType:(number|undefined),
   *       data:string
   *     },
   *     lastReceived:number
   *   }>)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getReceivedAplixNotifications = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getReceivedAplixNotifications', args, onSuccess, onFailed);
  };

  /**
   * 現在表示中の画面がタッチ発火の結果起動したものであれば、タッチしたデバイスのIDを取得する
   *
   * タッチしたものがMemberAssignmentServiceであれば、jm1UniqIdが設定されて返ってくる。
   * 通常のデバイスであればserviceUuidが指定されて返ってくる。
   * 現在の画面がタッチ発火の結果起動したものではない場合は両方ともundefinedで返ってくる。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function(!{
   *     jm1UniqId:(number|undefined),
   *     serviceUuid:(string|undefined)
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getTouchedDeviceId = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getTouchedDeviceId', args, onSuccess, onFailed);
  };

  /**
   * 指定デバイスに対するタッチ発火の発生を指定時間停止する。
   *
   * 時間が過ぎたら発火検出開始するので必要であれば定期的にこの関数を呼ぶ必要がある。
   * 停止しっぱなしになるリスクを恐れて安全面に倒したための仕様。
   *
   * args.jm1UniqId - 指定デバイス
   * args.time - ミリ秒。呼び出し時点からこの時間の間発生したタッチイベントは無視する
   *
   * この関数の効果は常に上書きされる。累積はしない。
   * args.timeは呼び出し時点から一定時間の指定であって、その時点で登録されている時間を延長する、ということではない。
   * なので、最初に10分で登録したとして、その後3分で登録しなおした場合、最初の10分の指定は無効となり、
   * 2回目の呼び出しの3分経過後以降はタッチ発火するようになる。
   *
   * この関数は実行中のアプリとWebViewが最前面にある場合のみ受け付けられる。
   * バックグラウンド(画面ロック中も含む)で呼び出した場合は無視される。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはないが効果は
   * ZEDeviceManagerRestricted::obtainInformationOnSurroundingDevicesWithHandler:timeout:options
   * に対するものとなる。
   *
   * @param {!{
   *     jm1UniqId:number,
   *     time:number
   *   }} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.pauseDeviceTouchEvent = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.pauseDeviceTouchEvent', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイス、MemberAssignmentServiceの登録済みローカルパスロスを取得する。
   *
   * テーブルはサービス毎ではなくシステム全体に共通となる。
   * 不揮発メモリに保存されるので登録を解除するまで有効。
   *
   * onSuccessの結果はJsDocの書き方が不明なのでObjectになっているが、
   * テーブルに登録されているJM1ユニークID(number)をキーとして、登録内容がvalueになってる以下のようなObject。
   *
   * {
   *   12345: {
   *     type:1, // 1:JM1 2:MemberAssignmentService
   *     immediate:-48
   *   },
   *   678:{}
   * }
   *
   * キーはstringではなくnumberなので0パディングとか気にせず、JM1ユニークIDの数字表現でダイレクトアクセスできる。
   * value値にはtypeを含むのでそれでJM1かMemberAssignmentServiceかを区別する。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはないが効果は
   * ZEDeviceManagerRestricted::obtainInformationOnSurroundingDevicesWithHandler:timeout:options
   * ZEUtility::obtainMemberAssignmentServiceWithHandlerBlock:option
   * に対するものとなる。
   *
   * @param {Object} args 引数。現在は未使用。
   * @param {function(Object)} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getLocalPathlossTable = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getLocalPathlossTable', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスのローカルパスロスをnativeに登録する。
   *
   * 登録はサービス毎ではなくシステム全体に共通の登録となる。
   * 設定結果は不揮発メモリに保存されるので登録を解除するまで有効。
   *
   * 既に登録済みのJM1ユニークIDを指定する場合は上書きの意。
   * 登録解除は通常用途としては必要ないはず。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはないが効果は
   * ZEDeviceManagerRestricted::obtainInformationOnSurroundingDevicesWithHandler:timeout:options
   * ZEUtility::obtainMemberAssignmentServiceWithHandlerBlock:option
   * に対するものとなる。
   *
   * @param {!{
   *     type:number,
   *     jm1UniqId:number,
   *     immediate:number
   *   }} args  引数。args.typeは 1:JM1 2:MemberAssignmentService
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.registerLocalPathloss = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.registerLocalPathloss', args, onSuccess, onFailed);
  };

  /**
   * JM1情報を取得する。
   * 対象は以下のfunctionで返ってきたJM1。
   *
   * hubea.jm1.getNearbyJm1s
   * hubea.jm1.getNearbyMemberAssignmentServices
   * hubea.jm1.getTouchedDeviceId
   *
   * 本来の方向性はこれらのfunctionの戻り値に入ってる感じだが、
   * 必要な場面が限られてたりするのでこういう形にした。
   *
   * 指定されたJM1の情報がnativeに無い場合はonSuccessにnullが返る。
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはない。
   * nativeが常に周囲のJM1情報を蓄積しておくのでその情報を取りに行く。
   *
   * @param {!{jm1UniqId:number}} args
   * @param {function({
   *     pathloss:!{
   *       immediate:number,
   *       near:(number|undefined),
   *       far:(number|undefined)
   *     }
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getJm1Infos = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getJm1Infos', args, onSuccess, onFailed);
  };

  /**
   * サービスUUIDからJM1 Unique IDを取得する。
   *
   * @param {string} serviceUuid
   * @return {number} JM1 Unique ID
   */
  hubea.jm1.getJm1UniqueId = function(serviceUuid) {
    var shortServiceUuid = serviceUuid.replace(/\-/g, '');

    if (!shortServiceUuid.match(/^[0-9a-fA-F]{32}$/g)) {
      throw 'Invalid serviceUuid'
    }

    var oui = shortServiceUuid.substring(14, 16);
    var uniqueNumber = shortServiceUuid.substring(20, 26);

    return parseInt(oui + uniqueNumber, 16);
  };

  /**
   * JM1デバイスIDを取得する
   * args.serviceUuid 対象のサービスUUID
   * args.type 対象のType
   * args.deviceHandle 対象のデバイスハンドル
   * onSuccessでJM1デバイスIDが返ってくる。
   *
   * サービスUUIDから取得する場合はserviceUuid、typeを指定。
   * デバイスハンドルから復元する場合はdeviceHandleを指定。
   *
   * [対応するSDKのAPI]
   * ZEDeviceManagerRestricted::getDevicesWithMasterUuids:types:handler
   * ただし、配列には対応しない入出力それぞれ１組のみ
   * ZEDeviceManager::deviceWithHandle
   *
   * @param {!{
   *     serviceUuid:(string|undefined),
   *     type:(number|undefined),
   *     deviceHandle:(string|undefined)
   *   }} args
   * @param {function(!{
   *     deviceId:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.getDevice = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.getDevice', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスIDを解放する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * 無し。nativeのZEDeviceを開放する
   *
   * @param {!{deviceId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.release = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.release', args, onSuccess, onFailed);
  };

  /**
   * デバイスハンドルを取得する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::getHandle
   *
   * @param {!{deviceId:string}} args
   * @param {function(!{
   *     deviceHandle:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.getHandle = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.getHandle', args, onSuccess, onFailed);
  };

  /**
   * デバイスを登録モードに移行する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDeviceRestricted::startRegistration:password
   * username、passwordは非サポート
   *
   * @param {!{deviceId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.startRegistration = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.startRegistration', args, onSuccess, onFailed);
  };

  /**
   * AM1デバイスをペアリングする
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDeviceRestricted::startDeviceRegistration
   *
   * @param {!{deviceId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.startDeviceRegistration = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.startDeviceRegistration', args, onSuccess, onFailed);
  };

  /**
   * ローカルキーを生成し、デバイスに登録する
   * args.deviceId デバイスID
   * args.localKeyId ローカルキー識別子
   *
   * onSuccessでlocalKeyが返ってくるが、これは元のlocalKeyをBase64化したもの。
   * 編集の必要はないのでUint8Arrayとかより扱いやすいはず。
   *
   * [対応するSDKのAPI]
   * ZEDeviceRestricted::setNewLocalKey:username:password:handlerBlock
   * username、passwordは非サポート
   *
   * @param {!{deviceId:string, localKeyId:number}} args
   * @param {function(!{
   *     localKey:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.setNewLocalKey = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.setNewLocalKey', args, onSuccess, onFailed);
  };

  /**
   * ローカルキーを取得する
   * args.deviceId デバイスID
   * args.localKeyId ローカルキー識別子
   *
   * onSuccessでlocalKeyが返ってくるが、これは元のlocalKeyをBase64化したもの。
   * 編集の必要はないのでUint8Arrayとかより扱いやすいはず。
   *
   * [対応するSDKのAPI]
   * ZEDeviceRestricted::getLocalKey:username:password:handlerBlock
   * username、passwordは非サポート
   *
   * @param {!{deviceId:string, localKeyId:number}} args
   * @param {function(!{
   *     localKey:string
   *   })} onSuccess
   * @param {function(!{
   *     code:string,
   *     message:string
   *   })=} onFailed
   */
  hubea.jm1.device.getLocalKey = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.getLocalKey', args, onSuccess, onFailed);
  };

  /**
   * デバイスに登録されている全てのローカルキーを削除する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDeviceRestricted::deleteAllLocalKeys:password:handlerBlock
   * username、passwordは非サポート
   *
   * @param {!{deviceId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.deleteAllLocalKeys = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.deleteAllLocalKeys', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスに接続する
   * args.deviceId デバイスID
   * args.localKey ローカルキー(Base64)
   * args.localKeyId ローカルキー識別子
   *
   * [対応するSDKのAPI]
   * ZEDevice::startCommunication
   * ZEDevice::startCommunicationWithLocalKey:localKeyId
   * ローカルキーを指定した場合はstartCommunicationWithLocalKey、省略ならstartCommunication
   *
   * @param {!{deviceId:string, localKey:(string|undefined), localKeyId:(number|undefined)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.startCommunication = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.startCommunication', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスとの通信に使う鍵を切り替えます
   * args.localKey ローカルキー(Base64)
   * args.localKeyId ローカルキー識別子
   *
   * [対応するSDKのAPI]
   * ZEDevice::switchCommunicationWithDefaultKey
   * ZEDevice::switchCommunicationWithLocalKey:localKeyId
   * ローカルキーを指定した場合はswitchCommunicationWithLocalKey、省略ならswitchCommunicationWithDefaultKey
   * API が ZE_NOT_NECESSARY を返した場合も onSuccess が呼び出されます。
   *
   * @param {!{localKey:(string|undefined), localKeyId:(number|undefined)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.switchCommunication = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.switchCommunication', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスとの接続を切る
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::stopCommunication
   *
   * @param {!{deviceId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.stopCommunication = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.stopCommunication', args, onSuccess, onFailed);
  };

  /**
   * JM1デバイスが通信可能な範囲にあるかどうか
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::inRange
   *
   * @param {!{deviceId:string}} args
   * @param {function(!{
   *     inRange:boolean
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.inRange = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.inRange', args, onSuccess, onFailed);
  };

  /**
   * DataBlockSenderを取得する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::getDataBlockSender
   * ZEDeviceBlockSender::addListener
   *
   * この関数はnativeの処理の都合で同時に ZEDeviceBlockSender::addListener でListenerを設定します。
   * その解放のために hubea.jm1.dataBlockSender.release を必ず呼び出してください。
   *
   * @param {!{deviceId:string}} args
   * @param {function(!{
   *     senderId:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.getDataBlockSender = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.getDataBlockSender', args, onSuccess, onFailed);
  };

  /**
   * データを送信する
   * args.senderId センダーID
   * args.data 送信するデータ
   *
   * [対応するSDKのAPI]
   * ZEDataBlockSender::send
   *
   * @param {!{senderId:string, data:(string|Array<number>|Uint8Array)}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataBlockSender.send = function(args, onSuccess, onFailed) {
    hubea.jm1.dataBlockSender.sendRaw({
      senderId: args.senderId,
      data: hubea.util.toBase64(args.data)
    }, onSuccess, onFailed);
  };

  /**
   * バイナリデータを送信する
   * args.senderId センダーID
   * args.data 送信するデータ。Base64
   *
   * [対応するSDKのAPI]
   * ZEDataBlockSender::send
   *
   * @param {!{senderId:string, data:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataBlockSender.sendRaw = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataBlockSender.send', args, onSuccess, onFailed);
  };

  /**
   * ZEDataBlockSenderを開放する
   * args.senderId センダーID
   *
   * [対応するSDKのAPI]
   * ZEDataBlockSender::removeListener
   *
   * hubea.jm1.device.getDataBlockSender で自動的に設定された Listener を解除します。
   * この関数の呼び出しが無いとリークします。
   *
   * @param {!{senderId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataBlockSender.release = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataBlockSender.release', args, onSuccess, onFailed);
  };

  /**
   * DataBlockReceiverを取得する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::getDataBlockReceiver
   * ZEDeviceBlockReceiver::addListener
   *
   * この関数はnativeの処理の都合で同時に ZEDeviceBlockReceiver::addListener でListenerを設定します。
   * その解放のために hubea.jm1.dataBlockReceiver.release を必ず呼び出してください。
   *
   * @param {!{deviceId:string}} args
   * @param {function(!{
   *     receiverId:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.getDataBlockReceiver = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.getDataBlockReceiver', args, onSuccess, onFailed);
  };

  /**
   * 受信データを取得する。
   * このAPIで一旦取得したデータはnativeのバッファからは削除される。
   * 次にこのAPIを読んだときは続きの受信データが返る。
   * nativeから完全にPushされる仕組みだと何かとつらいので、受信データはnativeに順次バッファしておいて、このAPIで取りに行く。
   * そんなに大きなデータは扱わないはずなのでそんな仕組みでもイケるはず。
   *
   * 受信データが無い場合は空の配列が返る。
   *   onSuccess({data:[]})
   *
   * args.receiverId レシーバID
   *
   * [対応するSDKのAPI]
   * 直接対応するAPIはない。
   * nativeがレシーバID毎にZEDataBlockReceiver::addListenerでデータを自動的にバッファに受信するので、
   * そのバッファを読みに行く。
   *
   * @param {!{receiverId:string}} args
   * @param {function(!{
   *     data:!Array<!{
   *         data:string
   *       }>
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataBlockReceiver.getReceivedData = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataBlockReceiver.getReceivedData', args, onSuccess, onFailed);
  };

  /**
   * ZEDataBlockReceiverを開放する
   * args.receiverId レシーバID
   *
   * [対応するSDKのAPI]
   * ZEDataBlockReceiver::removeListener
   *
   * hubea.jm1.device.getDataBlockReceiver で自動的に設定された Listener を解除します。
   * この関数の呼び出しが無いとリークします。
   *
   * @param {!{receiverId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataBlockReceiver.release = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataBlockReceiver.release', args, onSuccess, onFailed);
  };

  /**
   * DigitalOutputを取得する
   * args.deviceId デバイスID
   *
   * [対応するSDKのAPI]
   * ZEDevice::getDigitalOutput
   * ZEDigitalOutput::addListener
   *
   * この関数はnativeの処理の都合で同時に ZEDigitalOutput::addListener でListenerを設定します。
   * その解放のために hubea.jm1.digitalOutput.release を必ず呼び出してください。
   *
   * @param {!{deviceId:string}} args
   * @param {function(!{
   *     digitalOutputId:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.device.getDigitalOutput = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.device.getDigitalOutput', args, onSuccess, onFailed);
  };

  /**
   * デジタル出力の状態を変更する
   * args.digitalOutputId デジタル出力ID
   * args.mask 有効ビット
   * args.value ON/OFFビット
   *
   * [対応するSDKのAPI]
   * ZEDigitalOutput::setState:value
   *
   * @param {!{digitalOutputId:string, mask:number, value:number}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.digitalOutput.setState = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.digitalOutput.setState', args, onSuccess, onFailed);
  };

  /**
   * ZEDigitalOutputを開放する
   * args.digitalOutputId デジタル出力ID
   *
   * [対応するSDKのAPI]
   * ZEDigitalOutput::removeListener
   *
   * hubea.jm1.device.getDigitalOutput で自動的に設定された Listener を解除します。
   * この関数の呼び出しが無いとリークします。
   *
   * @param {!{digitalOutputId:string}} args
   * @param {Function=} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.digitalOutput.release = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.digitalOutput.release', args, onSuccess, onFailed);
  };

  /**
   * コマンドを生成する
   * args.deviceId デバイスID
   * args.payload Payload。Base64
   *
   * ZECommandGeneratorインスタンスは都度生成、破棄。
   * onSuccessで返ってくるrawCommandはBase64。
   *
   * [対応するSDKのAPI]
   * ZECommandGenerator::initWithDevice
   * ZECommandGenerator::generateCommandWithPayload:into
   *
   * @param {!{deviceId:string, payload:string}} args
   * @param {function(!{
   *     commandId:number,
   *     rawCommand:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.commandGenerator.generateCommand = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.commandGenerator.generateCommand', args, onSuccess, onFailed);
  };

  /**
   * コマンドをパースする
   * args.deviceId デバイスID
   * args.rawCommand コマンド。Base64
   *
   * ZECommandGeneratorインスタンスは都度生成、破棄。
   * onSuccessで返ってくるpayloadはBase64。
   *
   * [対応するSDKのAPI]
   * ZECommandGenerator::initWithDevice
   * ZECommandGenerator::parseRawCommand:into
   *
   * @param {!{deviceId:string, rawCommand:string}} args
   * @param {function(!{
   *     commandId:number,
   *     payload:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.commandGenerator.parseRawCommand = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.commandGenerator.parseRawCommand', args, onSuccess, onFailed);
  };

  /**
   * データをエンコードする
   * args.deviceId デバイスID
   * args.data エンコードするデータ。Base64
   * args.key キー。Base64
   *
   * ZEDataEncoderインスタンスは都度生成、破棄。
   * onSuccessで返ってくるデータはエンコード結果をBase64にしたもの。
   *
   * [対応するSDKのAPI]
   * ZEDataEncoder::initWithDevice
   * ZEDataEncoder::encodeData:withKey:into
   *
   * @param {!{deviceId:string, data:string, key:string}} args
   * @param {function(!{
   *     data:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataEncoder.encodeData = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataEncoder.encodeData', args, onSuccess, onFailed);
  };

  /**
   * データをデコードする
   * args.deviceId デバイスID
   * args.data デコードするデータ。Base64
   * args.key キー。Base64
   *
   * ZEDataEncoderインスタンスは都度生成、破棄。
   * onSuccessで返ってくるデータはデコード結果をBase64にしたもの。
   *
   * [対応するSDKのAPI]
   * ZEDataEncoder::initWithDevice
   * ZEDataEncoder::decodeData:withKey:into
   *
   * @param {!{deviceId:string, data:string, key:string}} args
   * @param {function(!{
   *     data:string
   *   })} onSuccess
   * @param {Function=} onFailed
   */
  hubea.jm1.dataEncoder.decodeData = function(args, onSuccess, onFailed) {
    hubea.callNative('jm1.dataEncoder.decodeData', args, onSuccess, onFailed);
  };

})();

//##### demo.js #####

(function() {

  hubea.demo.writeValuesToDigitalOut = function(serviceUuid, mask, value, dulation, onSuccess) {
    hubea.callNative('writeValuesToDigitalOut', {
      serviceUuid: serviceUuid,
      mask: mask,
      value: value,
      dulation: dulation
    }, onSuccess);
  };

  hubea.demo.digitalOut.open = function(serviceUuid, onSuccess) {
    hubea.callNative('openDigitalOut', {
      serviceUuid: serviceUuid
    }, onSuccess);
  };

  hubea.demo.digitalOut.close = function(id, onSuccess) {
    hubea.callNative('closeDigitalOut', {
      serviceUuid: id
    }, onSuccess);
  };

  hubea.demo.digitalOut.write = function(id, mask, value, onSuccess) {
    hubea.callNative('writeDigitalOut', {
      serviceUuid: id,
      mask: mask,
      value: value
    }, onSuccess);
  };

  hubea.demo.blockSender.sendData = function(id, blockData, onSuccess) {
    hubea.callNative('sendBlockData', {
        serviceUuid: id,
        data: blockData
    }, onSuccess);
  };

  hubea.demo.audio.open = function(uri, onSuccess) {
    hubea.callNative('demoOpenAudio', {
      uri: uri
    }, onSuccess);
  };

  hubea.demo.audio.play = function(id) {
    hubea.callNative('demoPlayAudio', {
      id: id
    });
  };

  hubea.demo.audio.close = function(id) {
    hubea.callNative('demoCloseAudio', {
      id: id
    });
  };

})();

//##### addon.jquery.js #####

if (typeof jQuery != 'undefined') {
  (function($) {

    $.hubea = {
      jm1: {
        commandGenerator: {},
        dataBlockReceiver: {},
        dataBlockSender: {},
        dataEncoder: {},
        device: {},
        digitalOutput: {}
      },
      system: {
        activity: {},
        net: {
          socket: {}
        }
      },
      util: {}
    };

    $.hubea.ready = deferProcNoArgs(hubea.ready);

    $.hubea.jm1.getNearbyJm1s = deferProc(hubea.jm1.getNearbyJm1s);
    $.hubea.jm1.getNearbyMemberAssignmentServices = deferProc(hubea.jm1.getNearbyMemberAssignmentServices);
    $.hubea.jm1.getTouchedDeviceId = deferProc(hubea.jm1.getTouchedDeviceId);
    $.hubea.jm1.pauseDeviceTouchEvent = deferProc(hubea.jm1.pauseDeviceTouchEvent);
    $.hubea.jm1.getLocalPathlossTable = deferProc(hubea.jm1.getLocalPathlossTable);
    $.hubea.jm1.registerLocalPathloss = deferProc(hubea.jm1.registerLocalPathloss);
    $.hubea.jm1.getJm1Infos = deferProc(hubea.jm1.getJm1Infos);
    $.hubea.jm1.getDevice = deferProc(hubea.jm1.getDevice);
    $.hubea.jm1.device.release = deferProc(hubea.jm1.device.release);
    $.hubea.jm1.device.getHandle = deferProc(hubea.jm1.device.getHandle);
    $.hubea.jm1.device.startRegistration = deferProc(hubea.jm1.device.startRegistration);
    $.hubea.jm1.device.startDeviceRegistration = deferProc(hubea.jm1.device.startDeviceRegistration);
    $.hubea.jm1.device.setNewLocalKey = deferProc(hubea.jm1.device.setNewLocalKey);
    $.hubea.jm1.device.getLocalKey = deferProc(hubea.jm1.device.getLocalKey);
    $.hubea.jm1.device.deleteAllLocalKeys = deferProc(hubea.jm1.device.deleteAllLocalKeys);
    $.hubea.jm1.device.startCommunication = deferProc(hubea.jm1.device.startCommunication);
    $.hubea.jm1.device.switchCommunication = deferProc(hubea.jm1.device.switchCommunication);
    $.hubea.jm1.device.stopCommunication = deferProc(hubea.jm1.device.stopCommunication);
    $.hubea.jm1.device.inRange = deferProc(hubea.jm1.device.inRange);
    $.hubea.jm1.device.getDataBlockSender = deferProc(hubea.jm1.device.getDataBlockSender);
    $.hubea.jm1.dataBlockSender.send = deferProc(hubea.jm1.dataBlockSender.send);
    $.hubea.jm1.dataBlockSender.sendRaw = deferProc(hubea.jm1.dataBlockSender.sendRaw);
    $.hubea.jm1.dataBlockSender.release = deferProc(hubea.jm1.dataBlockSender.release);
    $.hubea.jm1.device.getDataBlockReceiver = deferProc(hubea.jm1.device.getDataBlockReceiver);
    $.hubea.jm1.dataBlockReceiver.getReceivedData = deferProc(hubea.jm1.dataBlockReceiver.getReceivedData);
    $.hubea.jm1.dataBlockReceiver.release = deferProc(hubea.jm1.dataBlockReceiver.release);
    $.hubea.jm1.device.getDigitalOutput = deferProc(hubea.jm1.device.getDigitalOutput);
    $.hubea.jm1.digitalOutput.setState = deferProc(hubea.jm1.digitalOutput.setState);
    $.hubea.jm1.digitalOutput.release = deferProc(hubea.jm1.digitalOutput.release);
    $.hubea.jm1.commandGenerator.generateCommand = deferProc(hubea.jm1.commandGenerator.generateCommand);
    $.hubea.jm1.commandGenerator.parseRawCommand = deferProc(hubea.jm1.commandGenerator.parseRawCommand);
    $.hubea.jm1.dataEncoder.encodeData = deferProc(hubea.jm1.dataEncoder.encodeData);
    $.hubea.jm1.dataEncoder.decodeData = deferProc(hubea.jm1.dataEncoder.decodeData);

    $.hubea.system.getInfo = deferProcNoArgs(hubea.system.getInfo);
    $.hubea.system.setIframeMode = deferProc(hubea.system.setIframeMode);
    $.hubea.system.getFailureInfo = deferProc(hubea.system.getFailureInfo);

    $.hubea.system.activity.showAlertDialog = deferProcNoArgs(hubea.system.activity.showAlertDialog);

    $.hubea.system.net.getNetworkInfo = deferProc(hubea.system.net.getNetworkInfo);
    $.hubea.system.net.socket.open = deferProc(hubea.system.net.socket.open);
    $.hubea.system.net.socket.close = deferProc(hubea.system.net.socket.close);
    $.hubea.system.net.socket.write = deferProc(hubea.system.net.socket.write);
    $.hubea.system.net.socket.read = deferProc(hubea.system.net.socket.read);
    $.hubea.system.net.socket.readInt = deferProc(hubea.system.net.socket.readInt);
    $.hubea.system.net.socket.readUnsignedInt = deferProc(hubea.system.net.socket.readUnsignedInt);
    $.hubea.system.net.socket.readText = deferProc(hubea.system.net.socket.readText);
    $.hubea.system.net.socket.readFully = deferProc(hubea.system.net.socket.readFully);

    $.hubea.util.repeat = deferProcUtilRepeat(hubea.util.repeat);

    /**
     * (args, onSuccess, onFailed)のパターン
     */
    function deferProc(func) {
      return function(args) {
        var defer = $.Deferred();

        func.call(null, args, function(result) {
          defer.resolve(result);
        }, function(error) {
          defer.reject(error);
        })
        return defer.promise();
      }
    }

    /**
     * (onSuccess, onFailed)のパターン
     */
    function deferProcNoArgs(func) {
      return function() {
        var defer = $.Deferred();

        func.call(null, function(result) {
          defer.resolve(result);
        }, function(error) {
          defer.reject(error);
        })
        return defer.promise();
      }
    }

    /**
     * util.repeat専用
     */
    function deferProcUtilRepeat(func) {
      return function(interval, proc) {
        var defer = $.Deferred();

        func.call(null, interval, proc).done(function(res) {
          defer.resolve(res);
        }).onfailed(function(err) {
          defer.reject(err);
        });
        return defer.promise();
      }
    }

  })(jQuery);
}
