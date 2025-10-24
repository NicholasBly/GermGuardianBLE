(function() {
  "use strict";

  var cognito = new Cognito();

  new Vue({

    // element to mount to
    el: '#app',

    // initial data
    data: {
      state: 'change_email',
      user: {
        username: '????',
        email: '????????',
        email_verified: true,
      },
      newEmail: '',
      confirminationCode: '',
      errorMessage: '',
    },

    // computed property
    computed: {
      // validator
      errors: function() {
        var self = this;
        return {
          newEmail: function() {
            var newEmail = self.newEmail.trim();
            if (newEmail.length == 0) {
              return ' ';
            }
            var emailRE = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            if (!emailRE.test(newEmail)) {
              return 'Please provide a valid email address.';
            }
            return false;
          },
          confirminationCode: function() {
            if (self.confirminationCode.length == 0) {
              return ' ';
            }
            return false;
          },
        };
      },
      hasError: function() {
        var self = this;
        switch (self.state) {
          case 'change_email':
            return self.errors.newEmail();
          case 'confirm':
            return self.errors.confirminationCode();
        }
        return false;
      },
    },

    // methods
    methods: {
      changeEmail: function() {
        var self = this;
        cognito.updateEmail(self.newEmail)
          .then(function() {
            self.errorMessage = '';
            self.state = 'confirm';
          })
          .fail(function(err) {
            self.errorMessage = err.message;
          });
      },
      confirmEmail: function() {
        var self = this;
        cognito.confirmEmail(self.confirminationCode)
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'}, function() {
              self.returnToHome();
            });
          })
          .fail(function(err) {
            self.errorMessage = err.message;
          });
      },
      resendConfirmationCode: function() {
        var self = this;
        cognito.resendEmailConfirmationCode()
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'});
          })
          .fail(function(err) {
            hubea.system.activity.showAlertDialog({message: 'Failed to send mail', positive: 'OK'});
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
              if (!self.user.email_verified) {
                if (window.location.hash != '#reset') {
                  self.newEmail = self.user.email;
                  self.state = 'confirm';
                }
              }
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
