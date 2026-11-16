#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "Base64.h"
#include "esp_camera.h"
#include <WiFiUdp.h>
#include "FS.h"                // SD Card ESP32
#include "SD_MMC.h"            // SD Card ESP32
#include "driver/rtc_io.h"


// CAMERA_MODEL_AI_THINKER GPIO
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define FLASH_LED_PIN 4

const char* ssid = "HUAWEI-2.4G-7Bz5";
const char* password = "WBfD24NW";

String myDeploymentID = "AKfycbzyOUDtGE6ngdw5DNcfrG5H6LHCvyETOEb5oNj659aZ2BaPSWk2CSMdlB8Xh5FU5bhjog";

bool LED_Flash_ON = true;
WiFiClientSecure client;

unsigned int pictureNumber = 0;

// UDP setup
WiFiUDP udp;
const unsigned int localUdpPort = 4210; // must match fingerprint device
char incomingPacket[255];

// ----------------- CAMERA SETUP -----------------
void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;

  if(psramFound()){
    config.frame_size = FRAMESIZE_XGA;
    config.jpeg_quality = 10;
    config.fb_count = 3;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 15;
    config.fb_count = 3;
  }

  if(esp_camera_init(&config) != ESP_OK){
    Serial.println("Camera init failed!");
    ESP.restart();
  }

  sensor_t * s = esp_camera_sensor_get();
  s->set_framesize(s, FRAMESIZE_SXGA);
}

// ----------------- WIFI SETUP -----------------
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int timeout = 20*2;
  while(WiFi.status() != WL_CONNECTED){
    digitalWrite(FLASH_LED_PIN, HIGH);
    delay(250);
    digitalWrite(FLASH_LED_PIN, LOW);
    delay(250);
    Serial.println(WiFi.localIP());
    if(--timeout == 0){
      Serial.println("WiFi failed. Restarting.");
      ESP.restart();

    }
  }
  Serial.println("WiFi connected: " + WiFi.localIP().toString());
  udp.begin(localUdpPort);
}

// ----------------- HELPER FUNCTIONS -----------------
void Test_Con() {
  const char* host = "script.google.com";
  client.setInsecure();
  if(client.connect(host, 443)) {
    Serial.println("Connection test successful.");
    client.stop();
  } else {
    Serial.println("Connection test failed.");
    client.stop();
  }
}

void SendCapturedPhotos() {
  const char* host = "script.google.com";
  client.setInsecure();

  digitalWrite(FLASH_LED_PIN, HIGH);
  delay(100);
  digitalWrite(FLASH_LED_PIN, LOW);
  delay(100);

  if(client.connect(host, 443)){
    if(LED_Flash_ON) digitalWrite(FLASH_LED_PIN,HIGH);

    // Take photo
    camera_fb_t * fb = esp_camera_fb_get();
    if(!fb){ 
      Serial.println("Camera capture failed. Restarting.");
      ESP.restart();
      return;
    }
    if(LED_Flash_ON) digitalWrite(FLASH_LED_PIN,LOW);

    String url = "/macros/s/" + myDeploymentID + "/exec?type=check_in";

    client.println("POST " + url + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("Transfer-Encoding: chunked");
    client.println();

    int fbLen = fb->len;
    char *input = (char *)fb->buf;
    int chunkSize = 3 * 1000;
    int chunkBase64Size = base64_enc_len(chunkSize);
    char output[chunkBase64Size + 1];

    for (int i = 0; i < fbLen; i += chunkSize) {
      int l = base64_encode(output, input, min(fbLen - i, chunkSize));
      client.print(l, HEX);
      client.print("\r\n");
      client.print(output);
      client.print("\r\n");
      delay(100);
      input += chunkSize;
    }
    client.print("0\r\n\r\n");

    esp_camera_fb_return(fb);

    long startTime = millis();
    while(!client.available()){
      delay(100);
      if(startTime + 10000 < millis()) break;
    }
    while(client.available()) Serial.print((char)client.read());

    // Blink to indicate success
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
  } else {
    Serial.println("Connection failed.");
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
  }
  client.stop();
}

void SendCapturedPhotos2() {
  const char* host = "script.google.com";
  client.setInsecure();

  digitalWrite(FLASH_LED_PIN, HIGH);
  delay(100);
  digitalWrite(FLASH_LED_PIN, LOW);
  delay(100);

  if(client.connect(host, 443)){
    if(LED_Flash_ON) digitalWrite(FLASH_LED_PIN,HIGH);

    // Take photo
    camera_fb_t * fb = esp_camera_fb_get();
    if(!fb){ 
      Serial.println("Camera capture failed. Restarting.");
      ESP.restart();
      return;
    }
    if(LED_Flash_ON) digitalWrite(FLASH_LED_PIN,LOW);

   String url = "/macros/s/" + myDeploymentID + "/exec?type=check_out";

    client.println("POST " + url + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("Transfer-Encoding: chunked");
    client.println();

    int fbLen = fb->len;
    char *input = (char *)fb->buf;
    int chunkSize = 3 * 1000;
    int chunkBase64Size = base64_enc_len(chunkSize);
    char output[chunkBase64Size + 1];

    for (int i = 0; i < fbLen; i += chunkSize) {
      int l = base64_encode(output, input, min(fbLen - i, chunkSize));
      client.print(l, HEX);
      client.print("\r\n");
      client.print(output);
      client.print("\r\n");
      delay(100);
      input += chunkSize;
    }
    client.print("0\r\n\r\n");

    esp_camera_fb_return(fb);

    long startTime = millis();
    while(!client.available()){
      delay(100);
      if(startTime + 10000 < millis()) break;
    }
    while(client.available()) Serial.print((char)client.read());

    // Blink to indicate success
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
  } else {
    Serial.println("Connection failed.");
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
    digitalWrite(FLASH_LED_PIN,HIGH);
    delay(500);
    digitalWrite(FLASH_LED_PIN,LOW);
    delay(500);
  }
  client.stop();
}

// ----------------- SETUP -----------------
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);
  pinMode(FLASH_LED_PIN, OUTPUT);
  Serial.print("Initializing the MicroSD card module... ");
  initMicroSDCard();
  setupWiFi();
  setupCamera();
  Test_Con();
}

// ----------------- LOOP -----------------
void loop() {
  int packetSize = udp.parsePacket();
  if(packetSize){
    int len = udp.read(incomingPacket, 255);
    if(len > 0) incomingPacket[len] = 0;
    String msg = String(incomingPacket);
    Serial.println("Received: " + msg);

    // Trigger camera if button_2 or button_3 pressed
    if(msg == "button_2") {
      SendCapturedPhotos();
    } else if (msg == "button_3"){
      SendCapturedPhotos2();
    }
  }
}

void initMicroSDCard(){
  // Start Micro SD card
  Serial.println("Starting SD Card");
  if(!SD_MMC.begin()){
    Serial.println("SD Card Mount Failed");
    return;
  }
  uint8_t cardType = SD_MMC.cardType();
  if(cardType == CARD_NONE){
    Serial.println("No SD Card attached");
    return;
  }
}

void takeSavePhoto(String path){
  // Take Picture with Camera
  camera_fb_t  * fb = esp_camera_fb_get();

  
  
  if(!fb) {
    Serial.println("Camera capture failed");
    return;
  }

  // Save picture to microSD card
  fs::FS &fs = SD_MMC; 
  File file = fs.open(path.c_str(), FILE_WRITE);
  if(!file){
    Serial.println("Failed to open file in writing mode");
  } 
  else {
    file.write(fb->buf, fb->len); // payload (image), payload length
    Serial.printf("Saved file to path: %s\n", path.c_str());
  }
  file.close();
  
  //return the frame buffer back to the driver for reuse
  esp_camera_fb_return(fb); 
}