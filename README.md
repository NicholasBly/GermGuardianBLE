## A fully functional replacement to the GermGuardian iOS app for controlling your air purifier via bluetooth (BLE).

When the iOS app was discontinued, the app became useless because the web servers were shut down, leaving a white blank page. This led to the local bluetooth capability to be unavailable.

Through decompilation of the app, bypassing the web server, and rewriting the template "control.html" file, the app is rebuilt!

Steps taken:
1. Decompiled iOS app using DUmpDecrypt before it was taken off the app store.
2. Copied files/templates from "guardian.hubea.com" folder to "screens.hubea.com" folder (for making it easier to edit Info.plst)
3. Rebuilt control.html from template, and redesigned UI through Claude AI.
4. Rewrote intricacies with connecting/pairing/saving local authentication key

# App Installation
1. Use sideloading on iOS to install

# Setup
1. Turn on the air purifier and hold down the "Pair" button.
2. While still holding the pair button, launch the app.
3. Wait for pairing to complete.
4. The app will save the pairing local key to local storage.

# Features
- Real time updates to all features, including particulate matter, speed, and active enabled options (same as original app)
- All controls available to control before

# Features Added
1. Dark Mode Toggle
2. Console Log Toggle

The console log now shows power on hours of your filter and your UV-C bulb and the recommended time to replace.
