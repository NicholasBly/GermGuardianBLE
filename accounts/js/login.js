(function() {
  "use strict";

  var cognito = new Cognito();

  new Vue({

    // element to mount to
    el: '#app',

    // initial data
    data: {
      username: '',
      password: '',
      errorMessage: '',
      loading: false
    },

    // computed property
    computed: {
      errors: function() {
        var self = this;
        return {
          username: function() {
            if (self.username.trim().length == 0) {
              return 'Required.';
            }
            return false;
          },
          password: function() {
            if (self.password.length == 0) {
              return 'Required.';
            }
            return false;
          },
        }
      },
      hasError: function() {
        var self = this;
        for (var key in self.errors) {
          if (self.errors[key]()) {
            return true;
          }
        }
        return false;
      },
    },

    // methods
    methods: {
      signIn: function() {
        var self = this;
        var username = self.username.trim();
        self.loading = true;
        self.errorMessage = '';
        hubeaDelegate.getLoginId(username)
          .then(function(response) {
            if (response.result == 0) {
              return cognito.signIn(response.username, self.password);
            }
            return $.Deferred().reject({code:'ServerError', message:'Invalid Response [' + response.result + ']'}).promise();
          })
          .then(function() {
            self.loading = false;
            hubea.system.activity.load({url: 'home.html'});
            //window.location.replace('home.html');
          })
          .fail(function(err) {
            self.loading = false;
            switch(err.code) {
              case 'UserNotFoundException':
              case 'NotAuthorizedException':
                self.errorMessage = 'Cannot authentificate. Please check email or user ID and password.';
                break;
              default:
                console.log(err.code);
                self.errorMessage = err.message;
                break;
            }
          });
      },
      resetPassword: function() {
        hubea.system.activity.load({url: 'reset_password.html'});
      },
      returnToApp: function() {
        cognito.signOut();
        hubea.system.activity.finish();
      }
    },

    // ready
    ready: function() {
      var self = this;
      cognito.ready()
        .then(function() {
          return hubeaDelegate.init(cognito.getServerType(), cognito.env);
        })
        .then(function() {
          return cognito.checkSession();
        })
        .then(function(result) {
          if (result) {
            hubea.system.activity.load({url: 'home.html'});
            //window.location.replace('home.html');
            return;
          }
          hubea.system.activity.getParams(function(params) {
            if (params && params.queryParams && params.queryParams.username) {
              self.username = params.queryParams.username;
            }
          });
          self.$el.className = 'ready';
        })
        .fail(function(err) {
          // TODO: Any wording?
          self.returnToApp();
        });
    },
  });

})();
