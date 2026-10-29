import { Box, Button, Card, Flex, Heading, Text } from '@radix-ui/themes'
import { BiChat } from 'react-icons/bi'
import { useChannelList } from '@/utils/channel/ChannelListProvider'
import { __ } from '@/utils/translations'

/**
 * Trellis Team Chat (owner, 2026-10-29). When the viewer's company is on Team Chat, Trellis leaves
 * their read-only places out of Raven's lists and sends `team_chat` with the channel list. Then:
 * - nothing left to use (no client channel, no DM with a client): Raven is blurred behind this notice;
 * - client places left: a one-line note above them in the sidebar (TeamChatNoticeNote);
 * - an old link to a hidden place: this notice in the chat area (TeamChatNoticePanel).
 */
const NoticeCard = ({ url }: { url: string }) => (
    <Card size='4' className='max-w-md w-full shadow-xl' role='dialog' aria-labelledby='team-chat-notice-title'>
        <Flex direction='column' gap='3' align='start'>
            <Flex className='rounded-full bg-accent-3 text-accent-11 p-3' aria-hidden>
                <BiChat size='24' />
            </Flex>
            <Heading as='h2' size='5' id='team-chat-notice-title'>{__("Your team now talks in Team Chat")}</Heading>
            <Text as='p' size='3' color='gray'>
                {__("Raven isn't used for team conversations anymore. Your channels and messages, history included, are in Team Chat.")}
            </Text>
            <Button asChild size='3' className='mt-1 min-h-11 w-full sm:w-auto'>
                <a href={url} data-testid='team-chat-notice-open'>{__("Open Team Chat")}</a>
            </Button>
        </Flex>
    </Card>
)

/** Raven blurred behind the notice, for a Team Chat person with nothing left in Raven. */
export const TeamChatNoticeOverlay = () => {
    const { teamChat, channels, dm_channels, isLoading, error } = useChannelList()
    if (!teamChat || isLoading || error || channels.length > 0 || dm_channels.length > 0) return null
    return <Box
        className='fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/20 dark:bg-black/40 backdrop-blur-md'
        data-testid='team-chat-notice'>
        <NoticeCard url={teamChat.url} />
    </Box>
}

/** In the chat area, for a link to a place Trellis left out (read-only: its history is in Team Chat). */
export const TeamChatNoticePanel = () => {
    const { teamChat } = useChannelList()
    if (!teamChat) return null
    return <Flex className='h-full min-h-[60dvh] items-center justify-center p-4 backdrop-blur-sm' data-testid='team-chat-notice-panel'>
        <NoticeCard url={teamChat.url} />
    </Flex>
}

/** Above the client places in the sidebar, for a Team Chat person who still has some in Raven. */
export const TeamChatNoticeNote = () => {
    const { teamChat, channels, dm_channels } = useChannelList()
    if (!teamChat || (channels.length === 0 && dm_channels.length === 0)) return null
    return <Card size='1' className='mx-1 my-1' data-testid='team-chat-notice-note'>
        <Flex direction='column' gap='1'>
            <Text size='2' weight='medium'>{__("Your team now talks in Team Chat.")}</Text>
            <Text size='1' color='gray'>{__("Raven is only for your client chats.")}</Text>
            <a href={teamChat.url} className='text-sm text-accent-11 underline underline-offset-2 py-1'>{__("Open Team Chat")}</a>
        </Flex>
    </Card>
}
