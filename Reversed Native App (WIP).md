### --[WIP] This will serve as a detailed log to fully reverse engineer the encryption, decryption, and handshake process in order to recreate the logic--

## The Core: Dynamic "Nonce" Encryption

The same unencrypted command (e.g., "Get Status") results in a different encrypted packet every time.

Input: 04 00 02 80 86 (Get Status, unencrypted command in hex)

Output 1 (example): e6 10 5d ee 25 6e ... 10 61

Output 2 (example): 8e dd f6 16 e2 48 ... 4f 48

The encryption algorithm uses a dynamic nonce to ensure every command packet is unique to prevent replay attacks.

2. The Full Encryption Process (Ghidra)

The JavaScript files (hubea.js, guardian.js) are bridges that call the app's native (compiled) code to perform the actual work. Here is the full, two-step process:

## Step 1: The Nonce - when you send a Power On command:

-Guardian.js creates the simple command payload (e.g., [06 00 01 02 81 01 8b] for Power On).

JS Bridge: This is passed to Guardian.Device.prototype._encrypt, which in turn calls $._generateCommand -> hubea.jm1.commandGenerator.generateCommand.

Native Call (from Ghidra): This JS function calls a native Objective-C function:
generateCommandWithHDKJM1ID:payload:generatedCommand:generatedCommandID...

Nonce Added: This native function prepends a dynamic header (a counter) to the command.

[DYNAMIC_HEADER] + [YOUR_COMMAND]

[00 2e 12 29 55 ff 00 01 00 0f] + [06 00 01 02 81 01 8b]

## Step 2: The Encryption (The "Key")

### The 5th bit in the 10 bit nonce is always incremented by 1 after each poll/command.
+ When the air purifier sends a status update every 10 seconds, it will add 1 to its counter and will expect your command to follow that by matching it.

This new, combined "nonce'd" packet is then passed to a second native function.

JS Bridge: The packet from Step 1 is passed to $._encodeData -> hubea.jm1.dataEncoder.encodeData.

Native Call (from Ghidra): Your decompiler output confirms this JS function calls a second native function:
encodeDataWithHDKJM1ID:rawData:localKey:encodedData...

Encryption: This native function takes three things:

The combined "nonce'd" packet (e.g., [...55ff...] + [...018b])

Your Local Key: SeY5Lb3wNIGFIcNSYtAWuw==

The deviceId

Final Packet: It encrypts this data (likely using AES) and returns the final 48-byte blob. This is what gets sent over BLE.

## 3. The Handshake & Decryption (Your Answer)

Hook Guardian.Device.prototype._decrypt.

Client sends encrypted "Get Status" command

sendDataBlock OK.

resolveMessage[1] OK.

resolveMessage[2] OK.

✅ Initial status received!

Current state: {"power":false,"wind":5,...}

Notice what's missing: There is no [TWEAK] [JS] --- _decrypt CALLED --- log.

## The purifier's response is not encrypted. The device sends its status back as plain, unencrypted data (resolveMessage parses it directly as JSON).

The "Handshake" is therefore a simple, one-way authentication:

Client: Creates a dynamic, "nonce'd" "Get Status" command.

Client: Encrypts that command with the shared Local Key.

Client: Sends the final encrypted packet (e.g., e6 10 5d...) to the purifier.

Purifier: Receives the packet, decrypts it with its copy of the Local Key, and validates the nonce

