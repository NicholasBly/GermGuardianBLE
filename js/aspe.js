/**
 * Aplix Serial Packet Exchange (ASPE)
 */
var ASPE = {
    MessageTypes: {
      SET_DATA      : 0x01,
      GET_DATA      : 0x02,
      ENABLE_REPORT : 0x03,
      INPUT_REPORT  : 0x04,
      OUTPUT_REPORT : 0x05,
      SET_IDLE      : 0xEC,
      REST          : 0xED,
      RESPONSE      : 0xEE,
      DATA_RESPONSE : 0xEF,
    },
    ResponseTypes: {
      SUCCESS                  : 0x01,
      ERR_INVALID_MESSAGE_TYPE : 0x02,
      ERR_INVALID_DATA_TYPE    : 0x03,
      ERR_INVALID_PARAMTER     : 0x04,
      ERR_UNSUPPORTED_REQUEST  : 0x05,
      ERR_REQUEST_REJECTED     : 0x06,
      ERR_CHECKSUM             : 0x07,
      ERR_UNKNOWN              : 0x08,
      ERR_FATAL                : 0x09,
    },
    DataTypes: {
      NONE                  : 0x00,
      PROTOCOL_ID           : 0x01,
      DEVICE_LOG            : 0x02,
      ENCRYPTED_DATA        : 0x11,
      BEACON_STATUS         : 0x12,
      PROXIMITY_UUID        : 0x13,
      MAJOR                 : 0x14,
      MINOR                 : 0x15,
      MEASURED_POWER        : 0x16,
      TX_POWER_LEVEL        : 0x17,
      ADVERTISING_INTERVAL  : 0x18,
      ON_TIMER              : 0x21,
      OFF_TIMER             : 0x22,
      WAKEUP_BEACON_TIMER   : 0x23,
      ON_TIMER_S            : 0x24,
      OFF_TIMER_S           : 0x25,
      WAKEUP_BEACON_TIMER_S : 0x26,
      DEVICE_SPECIFIC_BEGIN : 0x80,
      DEVICE_SPECIFIC_END   : 0xff,
    },
    // DATA PACKET FORMAT
    Packet: {
      init: function(seqNo, type, payload) {
        this.seqNo = seqNo & 255;
        this.type = type & 255;
        this.data = [];
        this.data.push(this.seqNo);
        this.data.push(this.type);
        if (payload) {
          if (Array.isArray(payload)) {
            this.data = this.data.concat(payload);
          } else {
            this.data.push(payload & 255);
          }
        }
        this.packetLength = this.data.length + 1; //check sum分の長さを入れる
        this.data.unshift(this.packetLength);
        this.data.push(this.calcChecksum(this.data, 0, this.data.length));
      },
      fetch: function(data) {
        this.packetLength = data[0];
        this.seqNo        = data[1];
        this.type         = data[2];
        this.data         = data;
      },
      getType: function() {
        return this.type;
      },
      getLength: function() {
        return this.data.length;
      },
      getData: function() {
        return this.data;
      },
      getPayload: function() {
        var top = 3; //PACKET LENGTH + SEQUENCE NUMBER + MESSAGE TYPE
        var end = this.packetLength;
        if (this.data && top <= end && end <= this.data.length) {
          return this.data.slice(top, end);
        }
        return null;
      },
      calcChecksum: function(data, top, length) {
        var sum = 0;
        for (var i = top; i < top + length; i++) {
          sum = (sum + data[i]) & 255; 
        }
        return sum;
      },
      isValidChecksum: function() {
        var dataLen = this.data.length;
        var checksum =  this.calcChecksum(this.data, 0, dataLen - 1);
        //console.log('checksum:' + checksum + ' value:' + this.data[dataLen - 1]);
        return (checksum === this.data[dataLen - 1]);
      }
    }
};

/**
 * ASPE Message
 */
var ASPEMessage = function() {  

};
ASPEMessage.prototype = ASPE.Packet;
/**
 * RESPONSE MESSAGEのResponseTypeを取得する
 * RESPONSE MESSAGEでない場合にはnullが返却される
 * @returns number
 */
ASPEMessage.prototype.getResponse = function() {
  if (this.type == ASPE.MessageTypes.RESPONSE) {
    // RESPONSEのPayload長は１(RESPONSE TYPEのみ)
    var payload = this.getPayload();
    if (payload && 0 < payload.length) {
      return payload[0];
    }
  }
  return null;
};
/**
 * DATA RESPONSE MESSAGEのDataResponse配列を取得する
 * DATA RESPONSE MESSAGEでない場合にはnullが返却される
 * @returns Array<{dataType:number, responseType:number}>
 */
ASPEMessage.prototype.getDataResponse = function() {
  if (this.type == ASPE.MessageTypes.DATA_RESPONSE) {
    // DATA RESPONSEのPayload長は２(DATA TYPEとRESPONSE TYPE)の倍数(データ数)
    var array = [];
    var payload = this.getPayload();
    for (var i = 0; i + 1 < payload.length; i += 2) {
      array.push({
        dataType    : payload[i],
        responseType: payload[i + 1]
      });
    }
    return array;
  }
  return null;
};
/**
 * SET_DATA/INPUT_REPORT MESSAGEのData配列を取得する
 * SET_DATA/INPUT_REPORT MESSAGEでない場合にはnullが返却される
 * @returns Array<{dataType:number, payload:Array<number>}>
 */
ASPEMessage.prototype.getReportData = function() {
  if (this.type == ASPE.MessageTypes.SET_DATA ||
      this.type == ASPE.MessageTypes.INPUT_REPORT) {
    var array = [];
    var payload = this.getPayload();
    var readPos = 0;
    do {
      var dataLength = payload[readPos++] & 255;
      if (dataLength == 0) {
        break;
      }
      if (readPos + dataLength <= payload.length) {
        array.push({
          dataType: payload[readPos] & 255,
          payload : payload.slice(readPos + 1, readPos + dataLength)
        });
      }
      readPos += dataLength;
    } while (readPos < payload.length);
    return array;
  }
  return null;
}

/**
 * ASPE Data
 * (SET_DATA/INPUT_REPORT MESSAGEのPayload生成用)
 */
var ASPEData = function(dataType, payload) {
  this.types = [];
  this.data = [];
  this.addData(dataType, payload);
};
ASPEData.prototype.addData = function(dataType, payload) {
  if (!dataType) {
    return;
  }
  var data = [];
  data.push(dataType & 255);
  if (payload) {
    if (Array.isArray(payload)) {
      data = data.concat(payload);
    } else {
      data.push(payload & 255);
    }
  }
  data.unshift(data.length);
  this.types.push(dataType);
  this.data = this.data.concat(data);
}
ASPEData.prototype.getTypes = function() {
  return this.types;
}
ASPEData.prototype.getPayload = function() {
  return this.data;
}

/**
 * ASPE Exception
 */
var ASPEException = function(type, message) {
  this.name = 'ASPEException';
  this.type = type;
  this.message = message || '';
};
ASPEException.Types = {
  UNKNOWN : 0,
  INVALID_PACKET : -2,
  TOO_SHORT_PACKET : -3,
  INVALID_CHECKSUM : -4,
};
ASPEException.prototype = Object.create(Error.prototype);

(function() {
  'use strict';
  
  ASPE.RESET_PAYLOAD = new Array(255).fill(0);

  // 通信毎にSequence Numberは0から始める必要があるらしい
  // 即ち接続するデバイス毎にこれを管理する必要があるのだが、複数同時接続とか必要になったら考える
  var seqNo = 0;

  /**
   * 配列の先頭からMessageオブジェクトを1つだけ読み出して返却する。
   * 実際に読み出された配列の長さは返却されたMessageオブジェクトのバイト長を取得して判断すること。
   * １つのMessageに満たない場合はASPEException(TOO_SHORT_PACKET)を throwする。
   * 本来入力値はバイト列なのだが、native間I/Fの都合上数値の配列が入力となる。
   * (従って各要素にはUint8(0-255)の値が入っていることを前提とする)
   * @param Array<number>:data
   */ 
  ASPE.fetchMessage = function(data) {
    if (!Array.isArray(data)) {
      throw new ASPEException(ASPEException.Types.INVALID_PACKET);
    }
    data = data.slice(0);
    // (暫定)非暗号化用の固定ヘッダは取り除く
    if (data[0] == 0xFF) {
      data.splice(0, 5);
    }
    // PAYLOADを除く最小長さ未満なら読み出しは行わない
    if (data.length < 4) {
      throw new ASPEException(ASPEException.Types.TOO_SHORT_PACKET);
    }
    var packetLength = data[0] & 255;
    // PACKET LENGTH分のサイズ(PACKET LENGTH自体を除く)に満たない場合は読み出しは行わない
    if (data.length <= packetLength) {
      throw new ASPEException(ASPEException.Types.TOO_SHORT_PACKET);
    }
    var message = new ASPEMessage();
    message.fetch(data.slice(0, packetLength + 1));
    if (!message.isValidChecksum()) {
      throw new ASPEException(ASPEException.Types.INVALID_CHECKSUM);
    }
    return message;
  };

  /**
   * 送信用のMessageオブジェクトを１つ生成する
   * このメソッドを呼び出す度にSequence Numberがインクリメントされる
   * @param number:type
   * @param Array<number>:payload 
   */
  ASPE.buildMessage = function(type, payload) {
    var message = new ASPEMessage();
    // http://de.aplix.co.jp/redmine/projects/misc/wiki/APZ-451_Firmware_Spec/
    // ASPEの通信フォーマット中の SEQUENCE NUMBER は、利用せず、常に ０ とする。
    // (注意)非暗号化通信する間、はFunction Numberのヘッダ付与が必要
    message.init(0/*this.nextSequenceNumber()*/, type, payload);
    //if (!message.isValidChecksum()) {
    //  throw new ASPEException(ASPEException.Types.INVALID_CHECKSUM);
    //}
    return message;
  };

  /**
   * RESET PACKET FORMAT(通信相手の受信バッファをクリアにする特殊Message)を生成する
   * 固定データだが、書き戻し抑止のため都度生成
   */
  ASPE.buildResetMessage = function() {
    var message = new ASPEMessage();
    message.data = ASPE.RESET_PAYLOAD.slice();
    return message;
  }

  ASPE.nextSequenceNumber = (function() {
    return function() {
      if (seqNo == 256) {
        seqNo = 0;
      }
      return seqNo++;
    };
  })();

  ASPE.resetSequenceNumber = function() {
    seqNo = 0;
  }

})();
