#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <Speech/Speech.h>

@interface NotesIASpeech : NSObject <RCTBridgeModule>
@property(nonatomic, strong) AVAudioEngine *audioEngine;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, copy) RCTPromiseResolveBlock pendingResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock pendingReject;
@property(nonatomic, assign) BOOL inputTapInstalled;
@end

@implementation NotesIASpeech

RCT_EXPORT_MODULE(NotesIASpeech)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

RCT_REMAP_METHOD(isAvailable,
                 isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    SFSpeechRecognizer *recognizer =
        [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale currentLocale]];
    resolve(@(recognizer != nil && recognizer.isAvailable));
  });
}

RCT_REMAP_METHOD(start,
                 startWithLocale:(NSString *)locale
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.pendingResolve != nil) {
      reject(@"BUSY", @"Ya hay un dictado en curso.", nil);
      return;
    }

    self.pendingResolve = resolve;
    self.pendingReject = reject;
    [self requestPermissionsWithCompletion:^(BOOL granted) {
      if (!granted) {
        [self rejectCurrentWithCode:@"PERMISSION_DENIED"
                            message:@"Falta permiso para usar el micrófono y el dictado."];
        return;
      }
      [self beginRecognitionWithLocale:locale];
    }];
  });
}

RCT_REMAP_METHOD(stop,
                 stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopCapture];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(cancel,
                 cancelWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.pendingResolve != nil) {
      [self rejectCurrentWithCode:@"CANCELLED" message:@"Se canceló el dictado."];
    } else {
      [self releaseRecognition];
    }
    resolve(nil);
  });
}

- (void)requestPermissionsWithCompletion:(void (^)(BOOL granted))completion
{
  void (^requestMicrophone)(void) = ^{
    AVAudioSession *session = [AVAudioSession sharedInstance];
    switch (session.recordPermission) {
      case AVAudioSessionRecordPermissionGranted:
        completion(YES);
        break;
      case AVAudioSessionRecordPermissionDenied:
        completion(NO);
        break;
      case AVAudioSessionRecordPermissionUndetermined:
        [session requestRecordPermission:^(BOOL granted) {
          dispatch_async(dispatch_get_main_queue(), ^{
            completion(granted);
          });
        }];
        break;
    }
  };

  switch ([SFSpeechRecognizer authorizationStatus]) {
    case SFSpeechRecognizerAuthorizationStatusAuthorized:
      requestMicrophone();
      break;
    case SFSpeechRecognizerAuthorizationStatusNotDetermined:
      [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) requestMicrophone();
          else completion(NO);
        });
      }];
      break;
    case SFSpeechRecognizerAuthorizationStatusDenied:
    case SFSpeechRecognizerAuthorizationStatusRestricted:
      completion(NO);
      break;
  }
}

- (void)beginRecognitionWithLocale:(NSString *)locale
{
  NSLocale *requestedLocale =
      locale.length > 0 ? [[NSLocale alloc] initWithLocaleIdentifier:locale] : [NSLocale currentLocale];
  SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:requestedLocale];
  if (recognizer == nil || !recognizer.isAvailable) {
    [self rejectCurrentWithCode:@"NOT_AVAILABLE"
                        message:@"El reconocimiento de voz no está disponible."];
    return;
  }

  NSError *audioError = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryRecord
                  mode:AVAudioSessionModeMeasurement
               options:AVAudioSessionCategoryOptionDuckOthers
                 error:&audioError];
  if (audioError == nil) [session setActive:YES error:&audioError];
  if (audioError != nil) {
    [self rejectCurrentWithCode:@"START_FAILED" message:@"No se pudo iniciar el micrófono."];
    return;
  }

  self.audioEngine = [[AVAudioEngine alloc] init];
  self.request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  self.request.shouldReportPartialResults = NO;

  __weak NotesIASpeech *weakSelf = self;
  self.task = [recognizer recognitionTaskWithRequest:self.request
                                       resultHandler:^(SFSpeechRecognitionResult *result,
                                                       NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      NotesIASpeech *strongSelf = weakSelf;
      if (strongSelf == nil || strongSelf.pendingResolve == nil) return;
      if (result != nil && result.isFinal) {
        NSString *transcript = [result.bestTranscription.formattedString
            stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (transcript.length == 0) {
          [strongSelf rejectCurrentWithCode:@"NO_MATCH"
                                    message:@"No se reconoció ninguna frase."];
        } else {
          [strongSelf resolveCurrentWithTranscript:transcript];
        }
      } else if (error != nil) {
        [strongSelf rejectCurrentWithCode:@"RECOGNITION_FAILED"
                                  message:@"No se pudo convertir la voz en texto."];
      }
    });
  }];

  AVAudioInputNode *inputNode = self.audioEngine.inputNode;
  AVAudioFormat *format = [inputNode outputFormatForBus:0];
  if (format.sampleRate <= 0 || format.channelCount == 0) {
    [self rejectCurrentWithCode:@"START_FAILED" message:@"El micrófono no está disponible."];
    return;
  }
  [inputNode installTapOnBus:0
                  bufferSize:1024
                      format:format
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    [weakSelf.request appendAudioPCMBuffer:buffer];
  }];
  self.inputTapInstalled = YES;
  [self.audioEngine prepare];
  if (![self.audioEngine startAndReturnError:&audioError]) {
    [self rejectCurrentWithCode:@"START_FAILED" message:@"No se pudo iniciar el micrófono."];
    return;
  }

  SFSpeechAudioBufferRecognitionRequest *startedRequest = self.request;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(12 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (self.pendingResolve != nil && self.request == startedRequest) [self stopCapture];
  });
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(18 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (self.pendingResolve != nil && self.request == startedRequest) {
      [self rejectCurrentWithCode:@"TIMEOUT" message:@"No se detectó voz a tiempo."];
    }
  });
}

- (void)stopCapture
{
  if (self.audioEngine.isRunning) [self.audioEngine stop];
  if (self.inputTapInstalled) {
    [self.audioEngine.inputNode removeTapOnBus:0];
    self.inputTapInstalled = NO;
  }
  [self.request endAudio];
}

- (void)resolveCurrentWithTranscript:(NSString *)transcript
{
  RCTPromiseResolveBlock resolve = self.pendingResolve;
  self.pendingResolve = nil;
  self.pendingReject = nil;
  [self releaseRecognition];
  if (resolve != nil) resolve(transcript);
}

- (void)rejectCurrentWithCode:(NSString *)code message:(NSString *)message
{
  RCTPromiseRejectBlock reject = self.pendingReject;
  self.pendingResolve = nil;
  self.pendingReject = nil;
  [self releaseRecognition];
  if (reject != nil) reject(code, message, nil);
}

- (void)releaseRecognition
{
  [self stopCapture];
  [self.task cancel];
  self.task = nil;
  self.request = nil;
  self.audioEngine = nil;
  NSError *deactivationError = nil;
  [[AVAudioSession sharedInstance] setActive:NO
                                 withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                       error:&deactivationError];
}

@end
