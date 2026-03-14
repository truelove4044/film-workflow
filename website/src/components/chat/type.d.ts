interface ChatList {
  id: string;
  title: string;
  history: ChatMessage[];
  createTime: number;
}

type ChatMessage = UserMessage | AssistantMessage | NoticeMessage;

interface UserMessage {
  id: string;
  identity: "user";
  data: (UserMessageText | UserMessageImage)[];
}

interface UserMessageText {
  type: "text";
  text: string;
}

interface UserMessageImage {
  id: string;
  type: "image_url";
  image_url: {
    url: string;
  };
}

interface AssistantMessageTextWithConfirm {
  type: "textWithConfirm";
  text: string;
  button: {
    text: string;
    type?: "primary" | "ghost" | "dashed" | "link" | "text" | "default";
    fn?: Function;
  }[];
  confirm: boolean | undefined; // undefined表示未确认
}

interface AssistantMessage {
  id: string;
  identity: "assistant";
  role?: string;
  data: (AssistantMessageTextData | AssistantMessageTextWithConfirm | AssistantMessageImage)[];
}
//文本消息
interface AssistantMessageTextData {
  type: "text" | "thinking";
  text: string;
}

interface AssistantMessageImage {
  type: "image_url";
  image_url: {
    url: string;
  };
}

interface NoticeMessage {
  id: string;
  identity: "notice";
  data: string;
}
