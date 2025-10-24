(function() {
  "use strict";

  var cognito = new Cognito();

  new Vue({

    // element to mount to
    el: '#app',

    // initial data
    data: {
      state: 'reset_password',
      user: {
        username: '????',
        email: '????????',
        email_verified: true,
      },
      username: '',
      confirminationCode: '',
      newPassword: '',
      confirmNewPassword: '',
      errorMessage: '',
      launchByApp: false
    },

    // computed property
    computed: {
      // validator
      errors: function() {
        var self = this;
        return {
          username: function() {
            if (self.username.trim().length == 0) {
              return ' ';
            }
            return false;
          },
          confirminationCode: function() {
            if (self.confirminationCode.length == 0) {
              return ' ';
            }
            return false;
          },
          newPassword: function() {
            if (self.newPassword.length == 0) {
              return ' ';
            }
            if (self.newPassword.length < 6) {
              return 'Must be at least 6 characters long';
            }
            if (!self.newPassword.match(/[A-Z]/)) {
              return 'Must contain at least one uppercase letter (A-Z)';
            }
            if (!self.newPassword.match(/[0-9]/)) {
              return 'Must contain at least one number (0-9)';
            }
            return false;
          },
          confirmNewPassword: function() {
            if (self.confirmNewPassword.length == 0) {
              return ' ';
            }
            if (self.confirmNewPassword != self.newPassword) {
              return 'Please enter the same password as above.';
            }
            return false;
          },
        };
      },
      hasError: function() {
        var self = this;
        switch (self.state) {
          case 'reset_password':
            return self.errors.username();
          case 'confirm':
            return self.errors.confirminationCode()
                || self.errors.newPassword()
                || self.errors.confirmNewPassword();
        }
        return false;
      },
    },

    // methods
    methods: {
      resetPassword: function() {
        var self = this;
        hubeaDelegate.getLoginId(self.username.trim())
          .then(function(response) {
            if (response.result == 0) {
              return cognito.forgotPassword(response.username);
            }
            return $.Deferred().reject({code:'ServerError', message:'Invalid Response [' + response.result + ']'}).promise();
          })
          .then(function() {
            self.state = 'confirm';
          })
          .fail(function(err) {
            self.errorMessage = err.message;
          });
      },
      confirmResetPassword: function() {
        var self = this;
        cognito.confirmResetPassword(self.confirminationCode, self.newPassword)
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'}, function() {
              if (self.launchByApp) {
                self.returnToApp();
              } else {
                hubea.system.activity.load({url: 'home.html'});
                //window.location.href = 'home.html';
              }
            });
          })
          .fail(function(err) {
            self.errorMessage = err.message;
          });
      },
      resendConfirmationCode: function() {
        var self = this;
        // 再送もこれでok
        cognito.forgotPassword(self.username.trim())
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'});
          })
          .fail(function(err) {
            hubea.system.activity.showAlertDialog({message: 'Failed to send mail', positive: 'OK'});
          });
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
          hubea.system.activity.getParams(function(params) {
            if (params && params.queryParams) {
              if (params.queryParams.username) {
                self.username = params.queryParams.username;
              }
              self.launchByApp = (params.queryParams.caller === 'app');
            }
          });
          self.$el.className = 'ready';
        })
        .fail(function(err) {
          self.returnToApp();
        });
    },
  });

})();
