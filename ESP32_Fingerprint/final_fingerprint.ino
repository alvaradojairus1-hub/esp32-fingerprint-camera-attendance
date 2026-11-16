#include <Firebase.h>
#include <ArduinoJson.h>
#include "time.h"
#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include "secrets.h"
#include <FS.h>
#include <SPIFFS.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiUdp.h>

WiFiUDP udp;

const char* cameraIP = "192.168.100.154";  // <-- ESP32-CAM IP address
const unsigned int cameraPort = 4210;
// ----------------- HARDWARE SETUP -----------------
HardwareSerial mySerial(2);
#define RXD2 16
#define TXD2 17

#define BUTTON_PIN   4
#define BUTTON_PIN_2 5
#define BUTTON_PIN_3 18

String this_device = "ESP32_01";

// LCD setup
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Time vars
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 28800;
const int daylightOffset_sec = 0;

// Fingerprint sensor
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// Firebase
Firebase fb(REFERENCE_URL);

// Fingerprint IDs
uint8_t id = 1;

// ESP32-CAM IP
String camIP = "192.168.100.154"; // change to your ESP32-CAM IP

// ----------------- HELPER FUNCTIONS -----------------
void lcdPrint(String msg, bool clear = true) {
  if (clear) lcd.clear();
  lcd.setCursor(0, 0);
  if (msg.length() <= 16) {
    lcd.print(msg);
  } else {
    lcd.print(msg.substring(0,16));
    lcd.setCursor(0,1);
    lcd.print(msg.substring(16, (msg.length()<32?msg.length():32)));
  }
  delay(1000);
}

void triggerCamera(String type) {
  String url = "http://" + camIP + "/take_photo_" + type;
  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if(code == 200){
    lcdPrint("Camera OK", false);
  } else {
    lcdPrint("Camera Fail", false);
  }
  http.end();
}

// ----------------- SETUP -----------------
void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcdPrint("Booting...");

  if(!SPIFFS.begin(true)){
    lcdPrint("SPIFFS Mount Failed");
    return;
  }

  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);

  lcdPrint("WiFi: " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    lcdPrint("Connecting...");
    delay(500);
  }
  lcdPrint("WiFi Connected");
  
  udp.begin(4210);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUTTON_PIN_2, INPUT_PULLUP);
  pinMode(BUTTON_PIN_3, INPUT_PULLUP);

  struct tm timeinfo;
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  int retries = 0;
  while (!getLocalTime(&timeinfo) && retries < 3) {
    lcdPrint("Time sync...");
    delay(500);
    retries++;
  }
  if (retries == 3) {
    lcdPrint("Time Failed!");
    ESP.restart();
  } else {
    lcdPrint("Time Synced");
  }

  finger.begin(57600);
  if(finger.verifyPassword()){
    lcdPrint("FP sensor found");
  } else {
    lcdPrint("FP sensor fail");
    while(1);
  }

  finger.getTemplateCount();
  id = (finger.templateCount == 0) ? 1 : finger.templateCount + 1;

  lcdPrint("Device Ready!");
}

// ----------------- LOOP -----------------
void loop() {
  if(WiFi.status() == WL_CONNECTED){
    syncData();
  }

  if(digitalRead(BUTTON_PIN) == LOW){
    if(enroll4Fingers(id)) id+=4;
    delay(500);
  }

  if(digitalRead(BUTTON_PIN_2) == LOW){
    uint8_t fid = processFingerprint("check_in");
    if(fid != FINGERPRINT_TIMEOUT){
    udp.beginPacket(cameraIP, cameraPort);
    udp.print("button_2");
    udp.endPacket();;
    }
    delay(500);
  }

  if(digitalRead(BUTTON_PIN_3) == LOW){
    uint8_t fid = processFingerprint("check_out");
       if(fid != FINGERPRINT_TIMEOUT){
    udp.beginPacket(cameraIP, cameraPort);
    udp.print("button_2");
    udp.endPacket();;
    }
    delay(500);
  }
}

// ----------------- ENROLL 4 FINGERS -----------------
bool enroll4Fingers(uint8_t startID){
  lcdPrint("Enroll 4 fingers");
  const unsigned long TIMEOUT = 90000; // 1:30 min per finger

  for(uint8_t i=0;i<4;i++){
    uint8_t assignedID = startID + i;
    bool fingerEnrolled = false;
    while(!fingerEnrolled){
      int p=0;
      unsigned long startTime = millis();
      String scanProgress = "";
      for(uint8_t scan=1;scan<=2;scan++){
        bool scanSuccess=false;
        while(!scanSuccess){
          if(millis()-startTime > TIMEOUT){
            lcdPrint("Enroll timeout!");
            return false;
          }
          lcd.clear();
          lcd.setCursor(0,0);
          lcd.print("Finger "+String(i+1)+"/4");
          lcd.setCursor(0,1);
          lcd.print("Scan: "+scanProgress+" ");

          p = finger.getImage();
          if(p == FINGERPRINT_NOFINGER){delay(200); continue;}
          if(p != FINGERPRINT_OK){lcdPrint("Capture error"); delay(500); continue;}
          if(finger.image2Tz(scan) != FINGERPRINT_OK){lcdPrint("Conv error #"+String(scan)); delay(500); continue;}
          if(finger.fingerSearch() == FINGERPRINT_OK){
            lcdPrint("Use other finger");
            delay(1500);
            while(finger.getImage() != FINGERPRINT_NOFINGER) delay(300);
            startTime = millis();
            continue;
          }
          scanProgress += "*";
          lcd.setCursor(0,1);
          lcd.print("Scan: "+scanProgress+" ");
          delay(800);
          while(finger.getImage() != FINGERPRINT_NOFINGER) delay(300);
          scanSuccess=true;
        }
      }

      if((p = finger.createModel()) != FINGERPRINT_OK){
        lcdPrint("Mismatch, retry finger #"+String(i+1));
        continue;
      }
      lcdPrint("Model created");

      if((p = finger.storeModel(assignedID)) != FINGERPRINT_OK){
        lcdPrint("Store failed, retry");
        continue;
      }

      struct tm timeinfo;
      configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
      getLocalTime(&timeinfo);

      char timeStringBuff[20];
      strftime(timeStringBuff,sizeof(timeStringBuff),"%Y-%m-%dT%H:%M:%S",&timeinfo);

      StaticJsonDocument<256> doc;
      doc["department"] = "";
      doc["email"] = "";
      doc["fingerprintId"] = this_device+"_"+assignedID;
      doc["name"] = "";
      doc["notes"] = this_device;
      doc["timestamp"] = timeStringBuff;
      doc["userId"] = assignedID;

      String jsonStr;
      serializeJson(doc,jsonStr);
      saveOffline(jsonStr,"/pendingEnrollments/"+String(assignedID));

      fingerEnrolled=true;
      lcd.clear();
      lcd.setCursor(0,0);
      lcd.print("Finger "+String(i+1)+"/4 done!");
      lcd.setCursor(0,1);
      lcd.print("Scan: ** complete");
      delay(1000);
    }
  }
  lcdPrint("All 4 fingers done!");
  return true;
}

// ----------------- PROCESS FINGERPRINT -----------------
uint8_t processFingerprint(String type){
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("Scan "+type);
  lcd.setCursor(0,1);

  unsigned long startTime = millis();
  const unsigned long TIMEOUT = 10000;
  int retryCount=0;

  while(millis()-startTime < TIMEOUT){
    uint8_t p = finger.getImage();
    if(p == FINGERPRINT_NOFINGER){ delay(100); continue; }
    if(p == FINGERPRINT_OK){
      lcd.clear();
      lcd.setCursor(0,0);
      lcd.print("Image taken");
      if(finger.image2Tz() != FINGERPRINT_OK){
        lcd.setCursor(retryCount%16,1); lcd.print("*"); retryCount++; continue;
      }
      if(finger.fingerSearch() == FINGERPRINT_OK){
        lcd.clear();
        lcd.setCursor(0,0);
        lcd.print("Match ID:"+String(finger.fingerID));
        delay(500);

        struct tm timeinfo;
        configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
        getLocalTime(&timeinfo);

        char timeStringBuff[20];
        strftime(timeStringBuff,sizeof(timeStringBuff),"%Y-%m-%dT%H:%M:%S",&timeinfo);
        String tsb = timeStringBuff;

        lcd.setCursor(0,1);
        lcd.print(tsb.substring(11));
        delay(1000);

        String path = "/pendingAttendance/"+tsb.substring(0,4)+"/"+tsb.substring(5,7)+"/"+tsb.substring(8,10)+"/"+tsb.substring(11);
        JsonDocument docOutput;
        String output;
        docOutput["facultyId"] = "";
        docOutput["status"] = "";
        docOutput["timestamp"] = tsb;
        docOutput["type"] = type;
        docOutput["userId"] = finger.fingerID;
        serializeJson(docOutput,output);

        lcdPrint("Sending to FB");
        int responseCode = fb.setJson(path,output);
        if(responseCode == 200){
          lcdPrint("Firebase OK");
          delay(500);
          lcdPrint("device ready!");
        } else {
          lcdPrint("FB failed, save");
          JsonDocument offlineDoc;
          offlineDoc["path"] = path;
          offlineDoc["data"] = docOutput;
          String offlineJson;
          serializeJson(offlineDoc,offlineJson);
          saveOffline(offlineJson,path);
        }

        lcdPrint("Device Ready!");
        return finger.fingerID;
      } else {
        lcd.setCursor(retryCount%16,1); lcd.print("*"); retryCount++; delay(500); continue;
      }
    }
  }

  lcdPrint("Scan timeout");
  delay(500);
  lcdPrint("device ready!");
  return FINGERPRINT_TIMEOUT;
}

// ----------------- SAVE OFFLINE -----------------
void saveOffline(String jsonLine, String path){
  File f = SPIFFS.open("/buffer.txt",FILE_APPEND);
  if(!f){ lcdPrint("File write fail"); return; }
  String wrappedJson = (path.length()>0) ? "{\"path\":\""+path+"\",\"data\":"+jsonLine+"}" : jsonLine;
  f.println(wrappedJson);
  f.close();
  lcdPrint("Saved offline");
}

// ----------------- SYNC OFFLINE -----------------
void syncData(){
  if(!SPIFFS.exists("/buffer.txt")) return;
  File f = SPIFFS.open("/buffer.txt",FILE_READ);
  if(!f){ lcdPrint("File read fail"); return; }

  lcdPrint("Syncing...");
  String unsentData="";
  while(f.available()){
    String line = f.readStringUntil('\n'); line.trim();
    if(line.length()==0) continue;

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc,line);
    if(err){ lcdPrint("JSON parse fail"); delay(500); lcdPrint("Device Ready!"); continue; }

    String path = doc["path"];
    String payload; serializeJson(doc["data"],payload);
    int responseCode = fb.setJson(path,payload);
    if(responseCode==200){ lcdPrint("Synced OK"); delay(500); lcdPrint("Device Ready!"); }
    else{ lcdPrint("Sync fail"); delay(500); lcdPrint("Device Ready!"); unsentData += line + "\n"; }
  }
  f.close();

  if(unsentData.length()>0){
    File fw = SPIFFS.open("/buffer.txt",FILE_WRITE);
    if(!fw){ lcdPrint("Write fail"); delay(500); lcdPrint("Device Ready!"); return; }
    fw.print(unsentData); fw.close();
    lcdPrint("Retry next time");
    delay(500);
    lcdPrint("Device Ready!");
  } else {
    SPIFFS.remove("/buffer.txt");
    lcdPrint("All synced OK");
    delay(500);
    lcdPrint("Device Ready!");
  }
}
