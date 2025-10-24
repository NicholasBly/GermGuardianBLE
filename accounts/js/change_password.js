(function() {
  "use strict";

  var cognito = new Cognito();

  new Vue({

    // element to mount to
    el: '#app',

    // initial data
    data: {
      user: {
        username: '????',
        email: '????????',
        email_verified: true,
      },
      oldPassword: '',
      newPassword: '',
      confirmNewPassword: '',
      errorMessage: '',
    },

    // computed property
    computed: {
      // validator
      errors: function() {
        var self = this;
        return {
          oldPassword: function() {
            if (self.oldPassword.length == 0) {
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
      changePassword: function() {
        var self = this;
        cognito.changePassword(self.oldPassword, self.newPassword)
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'}, function() {
              self.returnToHome();
            });
          })
          .fail(function(err) {
            switch (err.code) {
              case 'NotAuthorizedException':
                self.errorMessage = 'Incorrect old password.';
                break;
              default:
                self.errorMessage = err.message;
                break;
            }
          });
      },
      returnToHome: function() {
        hubea.system.activity.load({url: 'home.html'});
        //window.location.href = 'home.html';
      },
      returnToLogin: function() {
        cognito.signOut();
        hubea.system.activity.load({url: 'login.html'});
        //window.location.href = 'login.html';
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
          return cognito.checkSession();
        })
        .then(function(result) {
          if (!result) {
            self.returnToLogin();
            return;
          }
          cognito.getUser()
            .then(function(user) {
              self.user = user;
              self.$el.className = 'ready';
            })
            .fail(function(err) {
              self.returnToLogin();
            });
        })
        .fail(function(err) {
          self.returnToLogin();
        });
    },
  });

})();
