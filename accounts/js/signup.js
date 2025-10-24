(function() {
  "use strict";

  var cognito = new Cognito();

  new Vue({

    // element to mount to
    el: '#app',

    // initial data
    data: {
      state: 'signup', // or 'confirm'
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      confirminationCode: '',
      agree: false,
      enableReturnToApp: false,
      errorMessage: '',
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
            if (self.username.match(/[A-Z]/)) {
              return 'Must not be included capital letters';
            }
            return false;
          },
          email: function() {
            if (self.email.length == 0) {
              return ' ';
            }
            var emailRE = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            if (!emailRE.test(self.email)) {
              return 'Please provide a valid email address';
            }
            return false;
          },
          password: function() {
            if (self.password.length == 0) {
              return ' ';
            }
            if (self.password.length < 6) {
              return 'Must be at least 6 characters long';
            }
            if (!self.password.match(/[A-Z]/)) {
              return 'Must contain at least one uppercase letter (A-Z)';
            }
            if (!self.password.match(/[0-9]/)) {
              return 'Must contain at least one number (0-9)';
            }
            return false;
          },
          confirmPassword: function() {
            if (self.confirmPassword.length == 0) {
              return ' ';
            }
            if (self.confirmPassword != self.password) {
              return 'Please enter the same password as above.';
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
          case 'signup':
            return self.errors.username()
                || self.errors.email()
                || self.errors.password()
                || self.errors.confirmPassword()
                || !self.agree;
          case 'confirm':
            return self.errors.confirminationCode();
        }
        return false;
      },
    },

    // methods
    methods: {
      signUp: function() {
        var self = this;
        var username = self.username.trim().toLowerCase();
        var attributes = {
          email: self.email,
        };
        cognito.signUp(username, self.password, attributes)
          .then(function() {
            self.errorMessage = '';
            self.state = 'confirm';
          })
          .fail(function(err) {
            switch (err.code) {
              case 'UsernameExistsException':
                self.errorMessage = 'This user ID is being used by other user.';
                break;
              default:
                self.errorMessage = err.message;
                break;
            }
            window.location.replace('#errorMessage');
          });
      },
      confirmRegistration: function() {
        var self = this;
        cognito.confirmRegistration(self.confirminationCode)
          .then(function() {
            hubea.system.activity.finish({result:{username: self.username.trim(), email: self.email, password: self.password}});
          })
          .fail(function(err) {
            self.errorMessage = err.message;
          });
      },
      resendConfirmationCode: function() {
        var self = this;
        cognito.resendConfirmationCode()
          .then(function() {
            hubea.system.activity.showAlertDialog({message: 'Success', positive: 'OK'});
          })
          .fail(function(err) {
            hubea.system.activity.showAlertDialog({message: 'Failed to send mail', positive: 'OK'});
          });
      },
      gotoEula: function() {
        var url = cognito.getLinkUrl(Cognito.Link.EULA);
        if (url) {
          hubea.system.launchApp({uri:url});
        }
      },
      gotoPrivacyPolicy: function() {
        var url = cognito.getLinkUrl(Cognito.Link.PRIVACY_POLICY);
        if (url) {
          hubea.system.launchApp({uri:url});
        }
      },
      gotoTermsOfUse: function() {
        var url = cognito.getLinkUrl(Cognito.Link.TERMS_OF_USE);
        if (url) {
          hubea.system.launchApp({uri:url});
        }
      },
      returnToApp: function() {
        var self = this;
        if (self.state == 'confirm') {
          hubea.system.activity.showAlertDialog({
            title: 'Cancel Signup',
            message: 'If you dismiss the signup, username "' + self.username.trim() + '" is going to unavailable.',
            positive: 'OK',
            negative: 'Go back'
          }, function(response) {
            if (response.result == 'positive') {
              hubea.system.activity.finish();
            }
          });
        } else {
          hubea.system.activity.finish();
        }
      },
    },

    // ready
    ready: function() {
      var self = this;
      cognito.ready()
        .then(function() {
          self.$el.className = 'ready';
        })
        .fail(function(err) {
          hubea.system.activity.showAlertDialog({
            message: 'Please confirm the network is actually connected to internet.',
            positive: 'OK'
          }, function() {
            self.returnToApp();
          });
        });
        var userAgent = navigator.userAgent.toLowerCase();
        if ((userAgent.search(/iphone|ipad|ipod|android/) > -1)) {
          self.enableReturnToApp = true;
        }
    },
  });

})();
