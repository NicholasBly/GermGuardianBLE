## A fully functional replacement to the GermGuardian iOS app for controlling your air purifier via bluetooth (BLE).

<!--<img width="150" height="327" alt="IMG_5295" src="https://github.com/user-attachments/assets/5c5b381d-5cc8-447d-9f06-12ec1c5f344d" />

<img width="150" height="327" alt="IMG_5293" src="https://github.com/user-attachments/assets/c06d6461-cd4c-4aba-9c0e-3ac511de8e0f" />-->
<!--<img width="150" height="327" alt="IMG_5346" src="https://github.com/user-attachments/assets/a80e6209-cab4-4bed-9a59-f0f7ef1746cd" />

<img width="150" height="327" alt="IMG_5345" src="https://github.com/user-attachments/assets/78cecea3-21fb-45bc-b714-10ac0e5df39d" />

<img width="150" height="327" alt="IMG_5343" src="https://github.com/user-attachments/assets/f95a7c87-1e4c-45cc-99aa-989244ed9ea0" />

<img width="150" height="327" alt="IMG_5347" src="https://github.com/user-attachments/assets/aca386bb-6e4e-478c-8adc-35f524395886" />-->

<img width="150" height="327" alt="IMG_6761" src="https://github.com/user-attachments/assets/b1c982e2-80a2-48e9-b9c3-6e74b88b3e36" />

<img width="150" height="327" alt="IMG_6760" src="https://github.com/user-attachments/assets/a526ddbf-715c-4773-8e62-59960ea4f914" />

<img width="150" height="327" alt="IMG_6759" src="https://github.com/user-attachments/assets/15a3de8a-9f3d-48ba-8b19-4f480729397d" />

<img width="150" height="327" alt="IMG_6762" src="https://github.com/user-attachments/assets/100a8f6a-338b-4cd8-873b-3832238d2860" />


When the iOS app was discontinued, the app became useless because the web servers were shut down, leaving a white blank page. This led to the local bluetooth capability to be unavailable.

Through decompilation of the app, bypassing the web server, and rewriting the template "control.html" file, the app is rebuilt!

Steps taken:
1. Decompiled iOS app using DumpDecrypt before it was taken off the app store.
2. Copied files/templates from "guardian.hubea.com" folder to "screens.hubea.com" folder (for making it easier to edit Info.plst)
3. Rebuilt control.html from template, and redesigned UI through Claude AI.
4. Rewrote intricacies with connecting/pairing/saving local authentication key

# App Installation
1. Use sideloading on iOS to install

# Setup
1. Turn on the air purifier and hold down the "Link" button.
2. While still holding the pair button, launch the app.
3. Wait for pairing to complete.
4. The app will save the pairing local key to local storage.

# Features
- Real time updates to all features, including particulate matter, speed, and active enabled options (same as original app)
- All controls available to control before
- HEPA Filter and UV-C bulb power on hours + life tracker
- Device selector in settings tab if more than one air purifier is detected

# Features Added
1. Dark Mode Toggle
2. Console Log Toggle

The console log now shows power on hours of your filter and your UV-C bulb and the recommended time to replace.
