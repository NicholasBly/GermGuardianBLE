(function($) {
  "use strict";

  var SERVER_TYPE = 'p';
  var SERVER_ENV = {
    'p': {
      serverUrl: 'https://guardian.hubea.com/air',
      aws: {
        region: 'ap-northeast-1',
        userPoolId: 'ap-northeast-1_BAEDTRwnx',
        clientId: '5172pch5s2f93vccldmieil18k'
      }
    },
    'd': {
      serverUrl: 'https://stage-g9txicyv-guardian.hubea.com/air',
      aws: {
        region: 'ap-northeast-1',
        userPoolId: 'ap-northeast-1_T8MTXu1BE',
        clientId: '6k85mfdp8b9ffqvq42lg20iqff'
      }
    }
  }
  var DEBUG = {level:5};

  var Cognito = function() {
    this.userPool = null;
    this.cognitoUser = null;
    this.env = SERVER_ENV[SERVER_TYPE] || {};
  };

  // WEB LINK
  Cognito.Link = {
     EULA: '/links/terms',
     PRIVACY_POLICY: '/links/privacy_policy',
     TERMS_OF_USE: '/links/guardian_technologies_terms'
  };

  Cognito.prototype.ready = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (!self.__ready) {
      self._init()
        .then(function() {
          self.__ready = true;
          $dfd.resolve();
        })
        .fail(function() {
          $dfd.reject();
        });
    } else {
      $dfd.resolve();
    }

    return $dfd.promise();
  };

  Cognito.prototype.isReady = function() {
    return self.__ready ? true : false;
  }

  Cognito.prototype.getLinkUrl = function(link) {
    for (var key in Cognito.Link) {
      if (Cognito.Link[key] === link) {
        return this.env.serverUrl + link;
      }
    }
  }

  Cognito.prototype.checkSession = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.getSession(function(err, session) {
        if (err) {
          Log.debug(err.code);
          $dfd.reject(err);
          return;
        }
        $dfd.resolve((session.isValid) ? true : false);
      });
    } else {
      $dfd.resolve(false);
    }

    return $dfd.promise();
  }

  Cognito.prototype.getUser = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.getUserAttributes(function(err, result) {
        if (err) {
          Log.debug(err.code);
          $dfd.reject(err);
          return;
        }
        var user = {
          username: self.cognitoUser.username,
          email: null,
          email_verified: null,
        };
        result.forEach(function(attr) {
          switch (attr.Name) {
            case 'email':
              user.email = attr.Value;
              break;
            case 'email_verified':
              user.email_verified = (attr.Value === 'true');
              break;
          }
        });
        $dfd.resolve(user);
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.signIn = function(username, password) {
    var self = this;
    var $dfd = $.Deferred();

    var userData = {
      Username: username,
      Pool: self.userPool
    };
    self.cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);

    var authenticationData = {
      Username: username,
      Password: password,
    };

    var authenticationDetails = new AWSCognito.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);

    // blocking issue
    setTimeout(function() {
      self.cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
          $dfd.resolve(result);
        },
        onFailure: function(err) {
          $dfd.reject(err);
        },
      });
    }, 800);

    return $dfd.promise();
  }

  Cognito.prototype.signOut = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.signOut();
    }

    $dfd.resolve();

    return $dfd.promise();
  };

  Cognito.prototype.signUp = function(username, password, attributes) {
    var self = this;
    var $dfd = $.Deferred();

    var attributeList = [];
    for (var key in attributes) {
      var data = {
        Name: key,
        Value: attributes[key],
      };
      var attr = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserAttribute(data);
      attributeList.push(attr);
    }

    self.userPool.signUp(username, password, attributeList, null, function(err, result) {
      if (err) {
        Log.debug(err.code);
        $dfd.reject(err);
        return;
      }
      self.cognitoUser = result.user;
      $dfd.resolve();
    });

    return $dfd.promise();
  };

  Cognito.prototype.confirmRegistration = function(code) {
    var self = this;
    var $dfd = $.Deferred();

    self.cognitoUser.confirmRegistration(code, true, function(err, result) {
      if (err) {
        Log.debug(err.code);
        $dfd.reject(err);
        return;
      }
      $dfd.resolve();
    });

    return $dfd.promise();
  };

  Cognito.prototype.resendConfirmationCode = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.resendConfirmationCode(function(err, result) {
        if (err) {
          Log.debug(err.code);
          $dfd.reject(err);
          return;
        }
        $dfd.resolve();
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.updateEmail = function(newEmail) {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      var attributeList = [];
      var attr = {
          Name : 'email',
          Value : newEmail,
      };
      var attr = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserAttribute(attr);
      attributeList.push(attr);

      self.cognitoUser.updateAttributes(attributeList, function(err, result) {
        if (err) {
          Log.debug(err.code);
          $dfd.reject(err);
          return;
        }
        $dfd.resolve();
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.confirmEmail = function(code) {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.verifyAttribute('email', code, {
        onSuccess: function(result) {
          Log.debug(result);
          $dfd.resolve();
        },
        onFailure: function(err) {
          $dfd.reject(err);
        },
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.resendEmailConfirmationCode = function() {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.getAttributeVerificationCode('email', {
        inputVerificationCode: function() {
          $dfd.resolve();
        },
        onFailure: function(err) {
          $dfd.reject(err);
        },
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.changePassword = function(oldPassword, newPassword) {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.changePassword(oldPassword, newPassword, function(err, result) {
        if (err) {
          Log.debug(err.code);
          $dfd.reject(err);
          return;
        }
        $dfd.resolve();
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  };

  Cognito.prototype.forgotPassword = function(username) {
    var self = this;
    var $dfd = $.Deferred();

    var userData = {
        Username: username,
        Pool: self.userPool
    };
    self.cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);

    self.cognitoUser.forgotPassword({
      inputVerificationCode: function() {
        $dfd.resolve();
      },
      onFailure: function(err) {
        $dfd.reject(err);
      },
    });

    return $dfd.promise();
  }

  Cognito.prototype.confirmResetPassword = function(code, newPassword) {
    var self = this;
    var $dfd = $.Deferred();

    if (self.cognitoUser != null) {
      self.cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: function(result) {
          Log.debug(result);
          $dfd.resolve();
        },
        onFailure: function(err) {
          $dfd.reject(err);
        }
      });
    } else {
      $dfd.reject();
    }

    return $dfd.promise();
  }

  Cognito.prototype.getServerType = function() {
    return SERVER_TYPE;
  };

  Cognito.prototype._init = function() {
    var self = this;
    var $dfd = $.Deferred();
    var awsConfig = self.env.aws || {};

    AWSCognito.config.region = awsConfig.region;
    var poolData = {
      UserPoolId: awsConfig.userPoolId,
      ClientId: awsConfig.clientId,
    };
    self.userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
    self.cognitoUser = self.userPool.getCurrentUser();
    $dfd.resolve();
    return $dfd.promise();
  }

  // Log
  var Log = {};
  (function() {
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
        if (i <= DEBUG.level && typeof console[m] === 'function') {
          Log[m] = function(){ console[m].apply(console, arguments); }
        } else {
          Log[m] = function(){}
        }
      })(methods[i]);
    }
  })();

  // Publish
  window.Cognito = Cognito;

})(jQuery);
