import useSWRSubscription from "swr/subscription";
import { fetcher } from "./useFetch";

const useUnreadCount = () => {
  const { data } = useSWRSubscription(
    "raven.api.raven_message.get_unread_count_for_channels",
    (key, { next }) => {
      let currentData = null;

      const updateData = (newData) => {
        currentData = newData;
        next(null, newData);
      }

      //Initial load
      fetcher(key).then((data) => updateData(data));

      frappe.realtime.on("raven:unread_channel_count_updated", (event) => {
        if (event.play_sound && event.sent_by !== frappe.session.user) {
          frappe.utils.play_sound("raven_notification");
        }

        if (event.sent_by !== frappe.session.user && currentData && currentData.message) {
          // Optimistic update
          const channelIndex = currentData.message.findIndex(c => c.name === event.channel_id);
          if (channelIndex !== -1) {
            const newChannels = [...currentData.message];
            newChannels[channelIndex] = {
              ...newChannels[channelIndex],
              unread_count: newChannels[channelIndex].unread_count + 1
            };
            updateData({ message: newChannels });
            return;
          }
        }

        fetcher(key).then((data) => updateData(data));
      });

      return () => frappe.realtime.off("raven:unread_channel_count_updated");
    },
  );

  const totalUnread = data?.message?.reduce((acc, c) => {
    return acc + c.unread_count
  }, 0)

  return {
    channels: data?.message ?? [],
    totalUnread,
  };
};

export const useChannelUnreadCount = (channelID) => {
  const data = useUnreadCount();

  return (
    data?.channels?.find((channel) => channel.name === channelID)
      ?.unread_count ?? 0
  );
};

export default useUnreadCount;
