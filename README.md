# DroidBinderTrace
Tracing Android Binder Activities via Frida 

When creating Android Application we are use to Apis, or Java Functions that wrap the logic for us.

Here are some Examples:

```Java

//Get DRM ID ?
android.media.MediaDrm -> getPropertyByteArray(MediaDrm.PROPERTY_DEVICE_UNIQUE_ID);

//Get AD ID Information ?
com.google.android.gms.ads.identifier.AdvertisingIdClient -> getAdvertisingIdInfo(getApplicationContext());

//Get Installed Application List ?
getPackageManager().getInstalledPackages(0);

```

Have you ever wondered what happens below those functions ?

### Services

Android is built around Services to provide Applications the content they need when they need. This comes in forms of (IPC) Inner Process Communication, either from Binder Transactions or from Intent / Content Provider.
Without these services you would not be able to do more than half of the things you wish to do, including getting device unique identifiers.

Think of these sercvices as Content Providers for certain content that you may need. You can even directly call to the services VIA ADB using the following command ```service call``` then follow it up with one of the following options:
```
getDeviceId
getDeviceIdForSubscriber
getImeiForSubscriber
getDeviceSvn
getSubscriberId
getSubscriberIdForSubscriber
getGroupIdLevel1
getGroupIdLevel1ForSubscriber
getIccSerialNumber
getIccSerialNumberForSubscriber
getLine1Number
getLine1NumberForSubscriber
getLine1AlphaTag
getLine1AlphaTagForSubscriber
getMsisdn
getMsisdnForSubscriber
getVoiceMailNumber
getVoiceMailNumberForSubscriber
getCompleteVoiceMailNumber
getCompleteVoiceMailNumberForSubscriber
getVoiceMailAlphaTag
getVoiceMailAlphaTagForSubscriber
getIsimImpi
getIsimDomain
getIsimImpu
getIsimIst
getIsimPcscf
getIsimChallengeResponse
getIccSimChallengeResponse
```

This will call to the service function that is responsiple for said command then return what is needed. Lets look at some Java code using Binders to Get the AD ID instead of using provided functions.
https://github.com/adjust/android_sdk/blob/master/Adjust/sdk-core/src/main/java/com/adjust/sdk/GooglePlayServicesClient.java

```Java

    private static final class GooglePlayServicesInterface implements IInterface {
        private IBinder binder;

        public GooglePlayServicesInterface(IBinder pBinder) {
            binder = pBinder;
        }

        public IBinder asBinder() {
            return binder;
        }

        public String getGpsAdid() throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            String id;
            try {
                data.writeInterfaceToken("com.google.android.gms.ads.identifier.internal.IAdvertisingIdService");
                binder.transact(1, data, reply, 0);
                reply.readException();
                id = reply.readString();
            } finally {
                reply.recycle();
                data.recycle();
            }
            return id;
        }

        public Boolean getTrackingEnabled(boolean paramBoolean) throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            Boolean limitAdTracking;
            try {
                data.writeInterfaceToken("com.google.android.gms.ads.identifier.internal.IAdvertisingIdService");
                data.writeInt(paramBoolean ? 1 : 0);
                binder.transact(2, data, reply, 0);
                reply.readException();
                limitAdTracking = 0 != reply.readInt();
            } finally {
                reply.recycle();
                data.recycle();
            }
            return limitAdTracking != null ? !limitAdTracking : null;
        }
    }
```

Executing the following code will Skip the Java Wrapped Function that does this for you (there for skipping possible method hooks) and directly communicate to the Service via Binders.<br>
The service Handling your Addvertisement ID is "Google Play Services" "com.google.android.gms", typically Interfaces can be linked or exported from the Service in thise case it would be "com.google.android.gms.ads.identifier.internal.IAdvertisingIdService".<br>
That Interface will be the Identifier Token once passed to the Binder, so the Binder knows where you want to send Data too as well as Receieve Data from.<br>

Alot of the Java code that handles this falls within the classes: "android.os.Binder", "android.os.IBinder", "android.os.BinderProxy". They eventually call to Native Functions to Handle the Rest but if they were to Implement Java functions to Communicate to a Service in Java, we can still Intercept that via Java Hooks.<br>

### Benefits of (IPC) and (IPC) Hooking

You can in theory skip that step and directly from the NDK Use "libbinder.so" to do excactly what you would do In java but C++ / Native code skipping Java Based Hooks. Example of this is "MediaDRM" class in Android, the "getPropertyByeArray" function is a Native function, there for it jumps straigh to Native functions to get the Task done via (IPC) Services.
https://android.googlesource.com/platform/frameworks/base/+/b267554/media/java/android/media/MediaDrm.java

If you are catching on, Hooking the Binder Directly can benefit us if the User Implements code using a Service to Commnicate instead of using Tradition Methods. Theres more, but a different goal, what if instead we Hooked the Provider it self (Service) instead of the Application that Recives said Data from the Provider ?
Well if we decide to Hook the Services instead of the Applications, the Detection Vector for Injections is now no longer a Issue. If you are no Longer injecting code into target application, but instead target service that the application communicates to for its data, then you no longer will set off Injection Detection Flags!

This concept is implemented in (Hide My App List): https://github.com/Dr-TSNG/Hide-My-Applist <br>
You do not need to select the Target Applications to Hook in LSPosed but more so just select "System Framework" then work your way to Services from there!

### Native Binder

For DRM the Service Handling the communication is "media.player" and the Interface Used is "android.media.IMediaPlayerService"<br>
To my research I could not find source code for that Service for my device, and it is also all mostly native there for a tradiditonal Java Hook what not will not do much.

We still can read Communication as they typically will be using the Native Apis if not the Service will be, here is the Control Flow:

```
[Java]
android.os.Binder
android.os.BinderProxy

[Native] (Client Side)
android_util_Binder.android_os_BinderProxy_transact
BpBinder.transact
IPCThreadState.transact
IPCThreadState.waitForResponse
IPCThreadState.talkWithDriver

IOCTL (Kernel Communication via Driver)

[Native] (Service Side)
IPCThreadState.executeCommand
BBinder.transact
JavaBBinder.onTransact

[Java] (Service Side)
android.os.Binder.execTransact
android.os.Binder.exeTransactInternal
```
![20201219073210661](https://github.com/user-attachments/assets/50e90f50-e7dc-47bf-b76e-c51ab8915705)

### Conclusion

[1] At the end of the Day most of those Java Apis Communicate to a Service to complete what is needed to be completed
 - - Application List
 - - DRM ID
 - - AD ID
 - - IMEI
 - - Device Integrity (DEVICE,BASIC,STRONG) (com.google.android.play.core.integrity.protocol.IIntegrityService)
 - - MUCH more <br>

[2] Applications can use Direct Communication to Services to avoid High level Java hooks, and even go as far as to Implement the Communication in the NDK to ensure Hooking Difficulty.<br>
[3] We can target Services so the Data out is now Spoofed, but not even that, the applications that require said data will not be able to detect Hooks as its happening VIA Service.<br>

This was all written during the end of my script and reversing and research nearly 30 hours no sleep so exuse mispless or grammer errors, when I get around to fix it I will.

### Frida Script
Frida script works by Finding the "libbinder.so" Module then finding the "transact" Export from "BpBinder" and "BBinder", they are Managed so Regex to Find them.<br>
To read the Interface that is being communicated with (at least for me til I do more research) in the After Hook of "transact" get the "data" Parcel Argument and Skip (12) bytes.<br>
At Offset (12) should be where a (4) byte Integer is written, that Integer is the (UTF16) string Size, that string will directly follow after those (4) bytes.<br>
More to add soon alot to do still, more research will be going on.<br>

Sources for Research:<br>
https://blog.csdn.net/Double2hao/article/details/111399789<br>
https://blog.csdn.net/qq_40587575/article/details/130610156<br>
https://www.51cto.com/article/523181.html<br>
https://blog.yorek.xyz/android/framework/binder1-mediaservice/#6-mediaplayerservice<br>
https://ljd1996.github.io/2020/07/09/Android-Binder%E5%8E%9F%E7%90%86%E5%9B%9B-%E5%AE%9E%E4%BE%8B%E4%B8%8E%E6%80%BB%E7%BB%93/<br>
https://events.static.linuxfound.org/images/stories/slides/abs2013_gargentas.pdf<br>
https://www.protechtraining.com/static/slides/Deep_Dive_Into_Binder_Presentation.html<br>
https://www.s3.eurecom.fr/docs/ndss21_pox.pdf<br>
https://blog.csdn.net/liuning1985622/article/details/138492529<br>
https://blog.csdn.net/lijie2664989/article/details/108418764<br>
https://xujiajia.blog.csdn.net/article/details/112131416<br>

https://android.googlesource.com/platform/frameworks/base/+/b267554/media/java/android/media/MediaDrm.java
https://github.com/adjust/android_sdk/blob/master/Adjust/sdk-core/src/main/java/com/adjust/sdk/GooglePlayServicesClient.java
https://github.com/Hamz-a/frida-android-libbinder/tree/master

https://android.googlesource.com/platform/frameworks/native/+/jb-dev/libs/binder/Binder.cpp
https://android.googlesource.com/platform/frameworks/native/+/jb-dev/libs/binder/BpBinder.cpp
