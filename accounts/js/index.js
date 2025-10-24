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
      }
    },

    // methods
    methods: {
      signOut: function() {
        this.returnToLogin();
      },
      changeEmail: function() {
        hubea.system.activity.load({url: 'change_email.html'});
      },
      changeEmailReset: function() {
        hubea.system.activity.load({url: 'change_email.html#reset'});
      },
      changePassword: function() {
        hubea.system.activity.load({url: 'change_password.html'});
      },
      returnToLogin: function() {
        var self = this;
        var queryString = '';
        if (self.username) {
          queryString = '?username=' + self.username;
        }
        cognito.signOut();
        hubea.system.activity.load({url: 'login.html' + queryString});
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
            hubea.system.activity.getParams(function(params) {
              if (params && params.queryParams && params.queryParams.username) {
                self.username = params.queryParams.username;
              }
              self.returnToLogin();
            });
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
