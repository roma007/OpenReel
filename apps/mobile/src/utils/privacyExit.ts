import { Alert, BackHandler, Platform } from 'react-native';

/**
 * 隐私政策「不同意并退出」的统一处理：
 * - Android：直接退出应用
 * - iOS：系统不允许应用自行关闭进程（exit(0)/suspend 均不合规），
 *   弹出系统提示，明确引导用户上滑返回桌面后手动关闭。
 */
export function exitAppOrExplain(): void {
  if (Platform.OS === 'android') {
    BackHandler.exitApp();
    return;
  }
  Alert.alert(
    '无法自动退出',
    'iOS 系统不允许应用自行关闭。请从屏幕底部上滑回到桌面，即可退出 OpenReel。',
    [{ text: '知道了' }],
    { cancelable: true }
  );
}
