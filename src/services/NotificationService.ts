import * as Notifications from 'expo-notifications';
import { Episode } from '../types';

export class NotificationService {
  private static instance: NotificationService;
  private currentNotificationId: string | null = null;

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async setupNotifications() {
    // Запрос разрешений
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.warn('Разрешения на уведомления не предоставлены');
        return false;
      }
    }

    // Настройка обработчика уведомлений
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Создаем категорию уведомлений с действиями
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
        buttonTitle: 'Открыть',
        options: {
          opensAppToForeground: true,
        },
      },
    ]);

    return true;
  }

  async showPlayerNotification(
      episode: Episode,
      isPlaying: boolean,
      currentTime: number,
      duration: number,
      imageUrl?: string
  ) {
    try {
      // Удаляем предыдущее уведомление
      if (this.currentNotificationId) {
        await Notifications.dismissNotificationAsync(this.currentNotificationId);
      }

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

      // Добавляем изображение, если URL предоставлен
      if (imageUrl) {
        content.attachments = [
          {
            url: imageUrl,
            options: {
              typeHint: 'public.jpeg',
            },
          },
        ];
      }

      // Создаем уведомление
      this.currentNotificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: null,
      });

      return this.currentNotificationId;
    } catch (error) {
      console.error('Ошибка создания уведомления:', error);
      return null;
    }
  }

  async hidePlayerNotification() {
    if (this.currentNotificationId) {
      await Notifications.dismissNotificationAsync(this.currentNotificationId);
      this.currentNotificationId = null;
    }
  }

  private formatTime(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Обработка нажатий на уведомления
  setupNotificationListeners(
      onNotificationPress: (data: any) => void,
      onPlayPausePress: () => void
  ) {
    // Обработка нажатий на уведомления когда приложение активно
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      // Можно добавить логику для обработки получения уведомлений
    });

    // Обработка нажатий на уведомления и действий
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content;
      const actionIdentifier = response.actionIdentifier;

      if (actionIdentifier === 'PLAY_PAUSE') {
        // Обработка нажатия на кнопку Play/Pause
        onPlayPausePress();
      } else {
        // Обработка обычного нажатия на уведомление
        onNotificationPress(data);
      }
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }
}