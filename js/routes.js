/**
 * 主にページ遷移する際の遷移方法の機能を提供する
 * 以下のjsが先にロードされている必要がある
 * - jQuery
 * - velocity.min.js
 */

var targetDevice;
var targetPlace = {screen: '', overlay: ''};

var routes = (function () {
  var file_path, footerState, isFullScreen;
  var current_file_path;
  var hasLocalStorage = {
  };

  /**
   * 要素を遷移させる
   * @param velocityOption {string}  遷移する方向left/right
   * @param footerState    {boolean} footerの表示/非表示
   * @param file_path      {string}   表示させたいコンテンツのテンプレートファイルのパス
   * @param onSuccess      {function}
   */
  function screenTransition(velocityOption, footerState, file_path, onSuccess) {
    if (file_path == current_file_path) {
      console.warn('Same file_path[' + file_path + '] transition.');
      return;
    }
    console.log('screenTransition file_path=' + file_path);
    var $content = $('#content');
    var $footer  = $('footer');
    var $swipeout = $content.find('> .wrapper');
    var $element;
    var flagFirstLoad = false;
    if (0 == $swipeout.length) {
      flagFirstLoad = true;
    } else if (1 < $swipeout.length) {
      return; //実行が重複しているため
    }
    if (flagFirstLoad) { // 初めて呼ばれた場合
      if (hasLocalStorage[targetPlace.screen]) {// localStorageにdomが格納されていた場合
        $element = $('<div class="wrapper">' + localStorage.getItem(targetPlace.screen) + '</div>');
        $element.appendTo($content);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        $('<div class="wrapper">').load(file_path, null, function (html) {
          localStorage.setItem(targetPlace.screen, html);
          hasLocalStorage[targetPlace.screen] = true;
          $element = $(this);
          $element.appendTo($content);
          if (onSuccess) {
            onSuccess();
          }
        });
        hasLocalStorage[targetPlace.screen] = true;
      }
    } else {
      var documentWidth = document.body.clientWidth;
      var transitionSpeedHorizontal = Math.round((documentWidth / 320) * 250);
      var velocityOptions = {left: -1, right: 1};

      var footerParameter = footerState ? 0 : (-1) * $footer.height();
      if (hasLocalStorage[targetPlace.screen]) {
        $element = $('<div class="wrapper">' + localStorage.getItem(targetPlace.screen) + '</div>');
        $swipeout.velocity({left: documentWidth * (velocityOptions[velocityOption])}, transitionSpeedHorizontal, 'ease-in-out', function () {
          $(this).remove();
        });
        $element.css({left: documentWidth * (-1) * (velocityOptions[velocityOption])}).appendTo($content)
          .velocity({left: 0}, transitionSpeedHorizontal, 'ease-in-out', function () {
          });
        $('footer').velocity({'margin-bottom': footerParameter}, 250, 'ease-in-out', function () {
        });
        if (onSuccess) {
          onSuccess();
        }
      } else {
        $('<div class="wrapper">').load(file_path, null, function (html) {
          localStorage.setItem(targetPlace.screen, html);
          hasLocalStorage[targetPlace.screen] = true;
          $element = $(this);
          $swipeout.velocity({left: documentWidth * (velocityOptions[velocityOption])}, transitionSpeedHorizontal, 'ease-in-out', function () {
            $(this).remove();
          });
          $element.css({left: documentWidth * (-1) * (velocityOptions[velocityOption])}).appendTo($content)
            .velocity({left: 0}, transitionSpeedHorizontal, 'ease-in-out', function () {
            });
          $('footer').velocity({'margin-bottom': footerParameter}, 250, 'ease-in-out', function () {
          });
          if (onSuccess) {
            onSuccess();
          }
        });
        hasLocalStorage[targetPlace.screen] = true;
      }
    }
    current_file_path = file_path;
  }

  /**
   * 要素を被せる
   * @param state          {boolean} overlayの表示/非表示
   * @param velocityOption {string}  遷移する方向Up/Down
   * @param isFullScreen   {boolean}
   * @param file_path      {string}  表示させたいコンテンツのテンプレートファイルのパス
   * @param onSuccess      {function}
   */
  function overlayTransition(state, velocityOption, isFullScreen, file_path, onSuccess) {
    console.log('overlayTransition file_path=' + file_path);
    var $content = $('#overlay');
    var headerHeight = isFullScreen ? 0 : $('header').outerHeight();
    var documentHeight = document.body.clientHeight - headerHeight;
    var transitionSpeedVertical = Math.round((documentHeight / 320) * 250);
    if (state) {
      if(1 <= $('#overlay > .wrapper').length){
        var removeTarget = $('#overlay > .wrapper');
        var returnFlag = false;
        removeTarget.each(function(){
          if($(this).data("targetplace") == targetPlace.overlay){
            returnFlag = true;
          }
        });
        if(returnFlag){
          console.log("validate");
          return false;
        } else {
          removeTarget.addClass('remove');
          setTimeout(function () {
            removeTarget.remove();
          },500);
        }
      }
      if (false /*hasLocalStorage[targetPlace.overlay]*/) {
        var $element = $('<div class="wrapper">' + localStorage.getItem(targetPlace.overlay) + '</div>');
        switch (velocityOption) {
          case 'up':
            $element.appendTo($content);
            break;
          case 'down':
            $element.prependTo($content);
            break;
        }
        $content.css('height',documentHeight);
        $element.css('max-height',documentHeight);
        $element.attr({'data-targetplace':targetPlace.overlay});
        $content.velocity({top: headerHeight}, transitionSpeedVertical, 'ease-in-out', function () {});
        if (onSuccess) {
          onSuccess();
        }
      } else {
        $('<div class="wrapper">').load(file_path, null, function (html) {
          localStorage.setItem(targetPlace.overlay, html);
          hasLocalStorage[targetPlace.overlay] = true;
          var $element = $(this);
          switch (velocityOption) {
            case 'up':
              $element.appendTo($content);
              break;
            case 'down':
              $element.prependTo($content);
              break;
          }
          $content.css('height',documentHeight);
          $element.css('max-height',documentHeight);
          $element.attr({'data-targetplace':targetPlace.overlay});
          $content.velocity({top: headerHeight}, transitionSpeedVertical, 'ease-in-out', function () {});
          if (onSuccess) {
            onSuccess();
          }
        });
      }
    } else {
      targetPlace.overlay = '';
      $content.velocity({top: documentHeight}, transitionSpeedVertical, 'ease-in-out', function () {$(this).html('').css('height',0);});
      if (onSuccess) {
        onSuccess();
      }
    }
  }

  function onWindowResized() {
    if (targetPlace.overlay) {
      var $overlay = $('#overlay');
      var documentHeight = document.body.clientHeight - $overlay.offset().top;
      $overlay.css('height',documentHeight);
      $overlay.children('.wrapper').css('max-height', documentHeight);
    }
  }

  var windowResizingTimer;
  $(window).resize(function() {
    if (windowResizingTimer) {
      clearTimeout(windowResizingTimer);
    }
    windowResizingTimer = setTimeout(onWindowResized, 200);
  });

  return {
    startup: {
      top: function(velocityOption, onSuccess) {
        targetPlace.screen = "startup",
        file_path          = "./template/startup.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      help: function(state, velocityOption, onSuccess) {
        targetPlace.overlay = "accountHelp";
        file_path           = "./template/account-whats.html";
        isFullScreen        = true;
        overlayTransition(state, 'up', isFullScreen, file_path, onSuccess);
      }
    },
    dashboard: {
      top: function(velocityOption, onSuccess) {
        targetPlace.screen = "dashboard",
        file_path          = "./template/dashboard.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      login: function(state, velocityOption, onSuccess) {
        targetPlace.overlay = "accountLogin";
        file_path           = "./template/account-login.html";
        isFullScreen        = true;
        overlayTransition(state, 'up', isFullScreen, file_path, onSuccess);
      }
    },
    register: {
      top: function(velocityOption, onSuccess) {
        targetPlace.screen = "registerTop",
        file_path          = "./template/register-s1.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      input: function(velocityOption, onSuccess) {
        targetPlace.screen = "registerInput",
        file_path          = "./template/register-s2.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      wifi: function(state, velocityOption, onSuccess) {
        targetPlace.overlay = "registerWifi";
        file_path           = "./template/bwg.html";
        isFullScreen        = true;
        overlayTransition(state, 'up', isFullScreen, file_path, onSuccess);
      },
      reset: function(velocityOption, onSuccess) {
        targetPlace.screen = "registerReset",
        file_path          = "./template/reset.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      }
    },
    device: {
      control: function(velocityOption, onSuccess) {
        targetPlace.screen = "deviceControl",
        file_path          = "./template/control.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      setting: function(velocityOption, onSuccess) {
        targetPlace.screen = "deviceSetting",
        file_path          = "./template/device-setting.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      icon: function (state, velocityOption, onSuccess) {
        targetPlace.overlay = "iconPicker";
        file_path           = "./template/icon-picker.html";
        isFullScreen        = true;
        overlayTransition(state, 'up', isFullScreen, file_path, onSuccess);
      }
    },
    vcontrol: {
      alexa_top: function(velocityOption, onSuccess) {
        targetPlace.screen = "voiceControlTop",
        file_path          = "./template/vcontrol-a1.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      alexa_setup: function(velocityOption, onSuccess) {
        targetPlace.screen = "voiceControlSetup",
        file_path          = "./template/vcontrol-a2.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      google_top: function(velocityOption, onSuccess) {
        targetPlace.screen = "voiceControlTop",
        file_path          = "./template/vcontrol-g1.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      },
      google_setup: function(velocityOption, onSuccess) {
        targetPlace.screen = "voiceControlSetup",
        file_path          = "./template/vcontrol-g2.html";
        footerState        = false;
        screenTransition(velocityOption, footerState, file_path, onSuccess);
      }
    },
    overlayRemove: function(){
      targetPlace.overlay = '';
      state               = false;
      velocityOption      = null;
      isFullScreen        = null;
      file_path           = null;
      onSuccess           = null;
      overlayTransition(state, velocityOption, isFullScreen, file_path, onSuccess);
    }
  };
})();
