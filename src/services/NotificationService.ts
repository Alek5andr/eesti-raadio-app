import * as Notifications from 'expo-notifications';
import { Episode } from '../types';

export class NotificationService {
  private static instance: NotificationService;
  private currentNotificationId: string | null = null;
  private static readonly PLAYER_NOTIFICATION_ID = 'player_notification';

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async setupNotifications(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
          console.warn('Разрешения на уведомления не предоставлены');
          return false;
        }
      }
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      await Notifications.setNotificationCategoryAsync('PLAYER_CONTROLS', [
        {
          identifier: 'PLAY_PAUSE',
          buttonTitle: 'Play/Pause',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'OPEN_APP',
          buttonTitle: 'Open',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
      await this.clearAllNotifications();

      return true;
    } catch (error) {
      console.error('Error setting up notifications:', error);
      return false;
    }
  }
  private getEpisodeImageUrl(episode: Episode): string | null {
    try {
      if (episode.photos && episode.photos.length > 0) {
        const photo = episode.photos[0];
        if (photo.photoTypes && photo.photoTypes[4] && photo.photoTypes[4].url) {
          return photo.photoTypes[4].url;
        }
        if (photo.photoTypes) {
          const availableTypes = Object.keys(photo.photoTypes);
          if (availableTypes.length > 0) {
            const firstAvailable = availableTypes[0];
            return photo.photoTypes[firstAvailable]?.url || null;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting episode image URL:', error);
      return null;
    }
  }
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }
  async clearBeforeNewEpisode(): Promise<void> {
    try {
      if (this.currentNotificationId) {
        await Notifications.dismissNotificationAsync(this.currentNotificationId);
        this.currentNotificationId = null;
      }
      try {
        await Notifications.dismissNotificationAsync(NotificationService.PLAYER_NOTIFICATION_ID);
      } catch (error) {
      }
    } catch (error) {
      console.error('Error clearing before new episode:', error);
    }
  }

  async showPlayerNotification(
      episode: Episode,
      isPlaying: boolean,
      currentTime: number,
      duration: number,
      fallbackImageUrl?: string
  ): Promise<string | null> {
    try {
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

      const content: Notifications.NotificationContent = {
        title: episode.heading || episode.title || 'Радио эпизод',
        body: `${isPlaying ? '▶️ Воспроизводится' : '⏸️ Приостановлено'} • ${this.formatTime(currentTime)} / ${this.formatTime(duration)}`,
        data: {
          episodeId: episode.id,
          action: 'player_control',
          progress: progress,
          isPlaying: isPlaying,
        },
        sticky: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sound: false,
        categoryIdentifier: 'PLAYER_CONTROLS',
      };
      const episodeImageUrl = this.getEpisodeImageUrl(episode);
      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier: NotificationService.PLAYER_NOTIFICATION_ID,        content,
        trigger: null,
      });

      this.currentNotificationId = notificationId;
      return notificationId;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  async hidePlayerNotification(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(NotificationService.PLAYER_NOTIFICATION_ID);
      this.currentNotificationId = null;
    } catch (error) {
      console.error('Error hiding notification:', error);
    }
  }

  private formatTime(milliseconds: number): string {
    try {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Time formatting error:', error);
      return '00:00';
    }
  }
  setupNotificationListeners(
      onNotificationPress: (data: any) => void,
      onPlayPausePress: () => void
  ): () => void {
    try {
      const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      });
      const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        try {
          const { data } = response.notification.request.content;
          const actionIdentifier = response.actionIdentifier;

          if (actionIdentifier === 'PLAY_PAUSE') {
            onPlayPausePress();
          } else {
            onNotificationPress(data);
          }
        } catch (error) {
          console.error('Error processing notification click:', error);
        }
      });

      return () => {
        try {
          foregroundSubscription.remove();
          responseSubscription.remove();
        } catch (error) {
          console.error('Error deleting notification listeners:', error);
        }
      };
    } catch (error) {
      console.error('Error configuring notification listeners:', error);
      return () => {};
    }
  }
}