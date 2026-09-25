#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface NotesIAConfig : NSObject <RCTBridgeModule>
@end

@implementation NotesIAConfig

RCT_EXPORT_MODULE(NotesIAConfig)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  NSString *apiBaseUrl = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"NotesIAApiBaseUrl"];
  return @{ @"apiBaseUrl" : apiBaseUrl ?: @"" };
}

@end
