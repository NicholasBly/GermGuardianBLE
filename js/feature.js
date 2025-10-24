/**
 * 最後に確認した新機能のバージョンをチェックして未確認であれば新機能紹介画面を起動する
 * 以下のjsが先にロードされている必要がある
 * - jQuery
 * - hubea.js
 * - activity.js
 */
var AppFeature = {};

(function() {
  /* @const */
  var LATEST_FEATURE_VER = 2;
  var SKEY_KNOWN_FEATURE = 'known-feature';
  var SKEY_UNACCEPTED_FEATURES = 'unaccepted-features';

  /**
   * ユーザーに提示する新機能項目リスト
   * idプロパティ値は以下のフォーマット
   *
   * 「featureVersion "-" itemNumber」
   *
   * featureVersion: 新機能が追加されたバージョン毎にインクリメント（アプリバージョンとは直結しない）
   * itemNumber: 同一featureVersion内で昇順に決定される項目番号
   */
  var FEATURES = [
    {
      id: '2-1',
      title: 'Google Home available',
      link: 'VCG2'
    },
    {
      id: '2-2',
      title: 'For Amazon Alexa Users',
      message: 'Invocation name has changed from "GiGi" to "Guardian Technologies"',
      link: 'VCA1'
    }
  ];

  var unacceptedFeatures = [];

  /**
   * 未承諾状態の機能リスト情報を取得する
   * @param callback: function
   * @return Array<Object>
   */
  AppFeature.getUnacceptedFeatures = function(callback) {
    var self = this;
    if (!$.isFunction(callback)) {
      return;
    }
    $initialPromise.then(function() {
      callback.call(self, unacceptedFeatures.slice());
    });
  };

  /**
   * 機能IDを承諾する（再表示させないようにする）
   * @param id: string
   * @param callback: function
   */
  AppFeature.acceptFeature = function(id, callback) {
    var self = this;
    if (!$.isFunction(callback)) {
      callback = $.noop;
    }
    $initialPromise.then(function() {
      var featureNum = unacceptedFeatures.length;
      unacceptedFeatures = unacceptedFeatures.filter(function(feature) {
        return (feature.id != id);
      });
      if (featureNum == unacceptedFeatures.length) {
        return;
      }
      return $Feature.updateknownFeature();
    }).always(function() {
      callback.call(self);
    });
  };

  /**
   * 機能IDを選択する（参照画面へ遷移する）
   * @param id: string
   * @param callback: function
   */
  AppFeature.actionFeature = function(id, callback) {
    var self = this;
    var link, actionUrl;
    if (!$.isFunction(callback)) {
      callback = $.noop;
    }
    for (var i = 0; i < FEATURES.length; i++) {
      if (FEATURES[i].id == id) {
        link = FEATURES[i].link;
        break;
      }
    }
    switch(link) {
    case 'VCA1':
      actionUrl = hubea.util.absolutePath('./vcontrol.html');
      break;
    case 'VCG2':
      actionUrl = hubea.util.absolutePath('./vcontrol.html#type=google&param=setup');
      break;
    default:
      break;
    }
    if (actionUrl) {
      Activity.launchActivity(actionUrl);
    }
    // アクション後に承諾
    AppFeature.acceptFeature(id, callback);
  }

  // jQuery deferred
  var $Feature = {};

  // 初期化処理（複数回実行しない事）
  $Feature.ready = function() {
    var featureIds = [];
    return $.Deferred(function($dfd) {
      hubea.ready(function() {
        $dfd.resolve();
      });
    }).then(function() {
      // ユーザー未チェックの機能を復元
      return $Feature.knownFeature();
    }).then(function(knownData) {
      if (knownData.version === Number.MAX_VALUE) {
        // インストール後初回起動
        var featureUrl = hubea.util.absolutePath('./features.html');
        Activity.launchActivity(featureUrl);
      }
      featureIds = knownData.featureIds;
      // 新たに表示すべき機能IDの一覧を生成
      var newIds = FEATURES.filter(function(feature) {
        if (feature.id) {
          var numbers = feature.id.split('-');
          return (knownData.version < Number(numbers[0]));
        }
        return false;
      }).map(function(feature) {
        return feature.id;
      });
      // 連結後、念のため重複削除
      featureIds = featureIds.concat(newIds).filter(function(id, index, self) {
        return (self.indexOf(id) == index);
      });
    }).fail(function() {
      console.error('Feature ready failed.');
    }).always(function() {
      FEATURES.forEach(function(feature) {
        if (featureIds.indexOf(feature.id) != -1) {
          unacceptedFeatures.push(feature);
        }
      });
      $Feature.updateknownFeature();
    });
  };

  $Feature.knownFeature = function() {
    return $.Deferred(function($dfd) {
      Activity.load(SKEY_KNOWN_FEATURE, function(data) {
        var version = Number.MAX_VALUE;
        var featureIds = [];
        if ($.isPlainObject(data)) {
          if (data.hasOwnProperty('version')) {
            try {
              version = Number(data.version);
            } catch (e) {}
          }
          if (Array.isArray(data.featureIds)) {
            featureIds = data.featureIds;
          }
        }
        $dfd.resolve({
          version: version,
          featureIds: featureIds
        });
      });
    });
  };

  $Feature.updateknownFeature = function() {
    return $.Deferred(function($dfd) {
      Activity.save(SKEY_KNOWN_FEATURE, {
        version: LATEST_FEATURE_VER,
        featureIds: unacceptedFeatures.map(function(feature) {
          return feature.id;
        })
      }, function() {
        $dfd.resolve();
      });
    });
  };

  var $initialPromise = $.Deferred(function($dfd) {
    $Feature.ready().always(function() {
      $dfd.resolve();
    });
  });

})();
