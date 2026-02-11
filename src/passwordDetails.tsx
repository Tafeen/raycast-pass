import {
  ActionPanel,
  List,
  Action,
  showToast,
  Toast,
  showHUD,
  getPreferenceValues,
  Icon,
  Clipboard,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { useExec } from "@raycast/utils";
import { userInfo } from "os";
import { exec } from "child_process";
import { Preferences } from "./utils";
import CreatePassForm from "./createPasswordForm";

export interface passwords_path_structure {
  pass_file_path: string;
  pass_file_name: string;
}

interface password_metadata {
  name: string;
  value: string;
}

type password_meta = password_metadata[];

const preferences = getPreferenceValues<Preferences>();
let options: any = {
  env: { PATH: preferences.path_var },
  ...process.env,
  ...userInfo(),
};

const sanitizeOtpOutput = (output: string) => {
  const withoutEscape = output.split(String.fromCharCode(27)).join("");
  const withoutAnsi = withoutEscape.replace(/\[[0-9;]*m/g, "");
  const firstNonEmptyLine = withoutAnsi
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstNonEmptyLine ?? "";
};

const runPassCommand = async (command: string) => {
  return new Promise<string>((resolve, reject) => {
    exec(command, options, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(stdout.toString());
    });
  });
};

const getOtpTimeToLive = async (passFileName: string) => {
  try {
    const uriOutput = await runPassCommand(`pass otp uri '${passFileName}'`);
    const otpUri = sanitizeOtpOutput(uriOutput);
    if (!otpUri.startsWith("otpauth://")) {
      return null;
    }

    const parsedUri = new URL(otpUri);
    if (parsedUri.hostname.toLowerCase() !== "totp") {
      return null;
    }

    const rawPeriod = Number(parsedUri.searchParams.get("period") ?? "30");
    const period = Number.isFinite(rawPeriod) && rawPeriod > 0 ? Math.floor(rawPeriod) : 30;
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const elapsedInWindow = nowInSeconds % period;
    const ttl = period - elapsedInWindow;

    return ttl === 0 ? period : ttl;
  } catch {
    return null;
  }
};

const getOtpCode = async (passFileName: string) => {
  const otpOutput = await runPassCommand(`pass otp '${passFileName}'`);
  return sanitizeOtpOutput(otpOutput);
};

const DeletePassword = async (props: passwords_path_structure) => {
  const cmd = exec(`pass rm -f '${props.pass_file_name}'`, options);
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Decrypting file",
  });

  cmd.stdout!.on("data", async (data) => {
    toast.style = Toast.Style.Success;
    toast.title = data;
    await showHUD("Password deleted");
  });

  cmd.on("close", (code) => {
    if (code != 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete password";
    }
  });
};

const CopyPassword = async (props: passwords_path_structure) => {
  const cmd = exec(`pass -c '${props.pass_file_name}'`, options);
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Decrypting file",
  });

  cmd.stdout!.on("data", async (data) => {
    toast.style = Toast.Style.Success;
    toast.title = data;
    await showHUD(data);
  });

  cmd.on("close", (code) => {
    if (code != 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to copy password";
    }
  });
};

const CopyOTP = async (props: passwords_path_structure) => {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Decrypting file",
  });

  try {
    const otpCode = await getOtpCode(props.pass_file_name);
    if (!otpCode) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not parse OTP code";
      return;
    }

    await Clipboard.copy(otpCode);
    toast.style = Toast.Style.Success;

    const ttl = await getOtpTimeToLive(props.pass_file_name);
    if (!ttl) {
      toast.title = "Copied OTP to clipboard";
      return;
    }

    let secondsLeft = ttl;
    toast.title = `Copied OTP to clipboard - ${secondsLeft}s left`;
    const interval = setInterval(() => {
      secondsLeft--;
      toast.title = `Copied OTP to clipboard - ${secondsLeft}s left`;
      if (secondsLeft === 0) {
        clearInterval(interval);
        toast.title = "OTP code expired";
      }
    }, 1000);
  } catch {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to copy OTP";
  }
};

function PasswordMetadata(props: passwords_path_structure) {
  const ParseMetadata = (raw_data: string) => {
    return raw_data
      .split(/\r?\n/)
      .map((val) => val.trim())
      .filter((val) => val.length > 0 && !val.startsWith("otpauth://"))
      .flatMap((val) => {
        const indx = val.indexOf(":");
        if (indx <= 0) {
          return [];
        }

        const field_name = val.slice(0, indx).trim();
        const field_value = val.slice(indx + 1).trim();
        return [{ name: field_name, value: field_value }];
      });
  };

  const HasOTP = (raw_data: string) => {
    return raw_data.split(/\r?\n/).some((line) => line.trim().startsWith("otpauth://"));
  };

  const loadPasswordDetails = () => {
    const [markdown, setMarkdown] = useState<password_meta>([]);
    const [hasOtp, setHasOtp] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    options = {
      ...options,
      onData: (data: string) => {
        setMarkdown(ParseMetadata(data));
        setHasOtp(HasOTP(data));
      },
    };

    const { isLoading } = useExec("pass", ["tail", `'${props.pass_file_name}'`], options);

    useEffect(() => {
      if (!hasOtp) {
        setOtpCode("");
        return;
      }

      let active = true;
      const fetchOtp = async () => {
        try {
          const currentOtp = await getOtpCode(props.pass_file_name);
          if (active) {
            setOtpCode(currentOtp);
          }
        } catch {
          if (active) {
            setOtpCode("");
          }
        }
      };

      fetchOtp();

      return () => {
        active = false;
      };
    }, [hasOtp, props.pass_file_name]);

    return (
      <List isLoading={isLoading}>
        {hasOtp ? (
          <List.Item
            title="OTP"
            accessories={[{ text: otpCode || "Loading..." }]}
            actions={
              <ActionPanel title="OTP">
                <Action.CopyToClipboard title="Copy OTP Value" content={otpCode} />
                <Action
                  title={"Copy OTP"}
                  icon={Icon.CopyClipboard}
                  onAction={() => CopyOTP(props)}
                  shortcut={{ modifiers: ["ctrl"], key: "o" }}
                />
              </ActionPanel>
            }
          />
        ) : null}
        {markdown.map((val, i) => {
          return (
            <List.Item
              key={i}
              title={val.name}
              accessories={[{ text: val.value }]}
              actions={
                <ActionPanel title={val.name}>
                  <Action.CopyToClipboard title={`Copy value of '${val.name}'`} content={val.value} />
                  <Action
                    title={"Copy Password"}
                    icon={Icon.CopyClipboard}
                    onAction={() => CopyPassword(props)}
                    shortcut={{ modifiers: ["ctrl"], key: "c" }}
                  />
                  <Action
                    title={"Copy OTP"}
                    icon={Icon.CopyClipboard}
                    onAction={() => CopyOTP(props)}
                    shortcut={{ modifiers: ["ctrl"], key: "o" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List>
    );
  };
  return loadPasswordDetails();
}

export default function GetPasswordDetails(props: passwords_path_structure) {
  return (
    <ActionPanel>
      <Action.Push
        title={"Browse Metadata"}
        icon={Icon.AppWindowList}
        target={<PasswordMetadata pass_file_path={props.pass_file_path} pass_file_name={props.pass_file_name} />}
        shortcut={{ modifiers: ["cmd"], key: "o" }}
      />
      <Action
        title={"Copy Password"}
        icon={Icon.CopyClipboard}
        onAction={() => CopyPassword(props)}
        shortcut={{ modifiers: ["ctrl"], key: "c" }}
      />
      <Action
        title={"Copy OTP"}
        icon={Icon.CopyClipboard}
        onAction={() => CopyOTP(props)}
        shortcut={{ modifiers: ["ctrl"], key: "o" }}
      />
      <Action.Push
        icon={Icon.Plus}
        shortcut={{ modifiers: ["ctrl"], key: "a" }}
        title={"Create Pass Entry"}
        target={<CreatePassForm />}
      />
      <Action
        style={Action.Style.Destructive}
        icon={Icon.Trash}
        shortcut={{ modifiers: ["ctrl"], key: "d" }}
        onAction={() => DeletePassword(props)}
        title={"Delete Pass Entry"}
      />
    </ActionPanel>
  );
}
