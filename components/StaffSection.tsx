import { useState } from "react";
import { staffMembers, type StaffMember } from "../src/staff";
import { useLocale } from "../src/i18n";
import { Icon } from "./Icon";

function StaffCard({ member }: { member: StaffMember }) {
  const { copy, isZh } = useLocale();
  const [wechatOpen, setWechatOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const bio = isZh ? member.bioZh : member.bio;
  const missing = !member.phone || !member.email || !member.wechat;
  const copyWechat = async () => {
    try {
      await navigator.clipboard.writeText(member.wechat!);
      setCopyStatus(copy.staff.copied);
    } catch {
      setCopyStatus(copy.staff.copyManually);
    }
  };
  return (
    <article className="staff-card" aria-labelledby={`staff-${member.id}`}>
      <div className="staff-portrait">
        <img
          src={`/staff/${member.id}.jpeg`}
          alt={member.name}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="staff-card-body">
        <h3 id={`staff-${member.id}`}>{member.name}</h3>
        <p className="staff-title">{isZh ? member.titleZh : member.title}</p>
        {bio && <p className="staff-bio">{bio}</p>}
        <div className="staff-actions">
          {member.phone ? (
            <a
              href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}
              title={member.phone}
              aria-label={`${copy.staff.phone}: ${member.name}, ${member.phone}`}
            >
              <Icon name="phone" size={19} />
              <span>{copy.staff.phone}</span>
            </a>
          ) : (
            <button
              disabled
              title={copy.staff.unavailable}
              aria-label={`${copy.staff.phone}: ${copy.staff.unavailable}`}
            >
              <Icon name="phone" size={19} />
              <span>{copy.staff.phone}</span>
            </button>
          )}
          {member.email ? (
            <a
              href={`mailto:${member.email}`}
              title={member.email}
              aria-label={`${copy.staff.email}: ${member.name}, ${member.email}`}
            >
              <Icon name="mail" size={19} />
              <span>{copy.staff.email}</span>
            </a>
          ) : (
            <button
              disabled
              title={copy.staff.unavailable}
              aria-label={`${copy.staff.email}: ${copy.staff.unavailable}`}
            >
              <Icon name="mail" size={19} />
              <span>{copy.staff.email}</span>
            </button>
          )}
          <button
            disabled={!member.wechat}
            title={member.wechat || copy.staff.unavailable}
            aria-label={`${copy.staff.wechat}: ${member.name}${member.wechat ? "" : `, ${copy.staff.unavailable}`}`}
            aria-expanded={wechatOpen}
            aria-controls={`wechat-${member.id}`}
            onClick={() => {
              setWechatOpen(!wechatOpen);
              setCopyStatus("");
            }}
          >
            <Icon name="wechat" size={21} />
            <span>{copy.staff.wechat}</span>
          </button>
        </div>
        <p className="staff-missing" aria-hidden={!missing}>
          {missing ? copy.staff.missingHint : "\u00a0"}
        </p>
        <div
          id={`wechat-${member.id}`}
          className="staff-wechat"
          hidden={!wechatOpen}
        >
          <span>{copy.staff.wechatId}</span>
          <code>{member.wechat}</code>
          <p>{copy.staff.wechatHelp}</p>
          <button className="text-link" onClick={copyWechat}>
            {copy.staff.copy}
          </button>
          <p role="status">{copyStatus}</p>
        </div>
      </div>
    </article>
  );
}

export function StaffSection() {
  const { copy } = useLocale();
  return (
    <section
      className="staff-section container"
      id="meet-our-staff"
      aria-labelledby="staff-heading"
    >
      <div className="staff-heading">
        <div>
          <p className="eyebrow">YC Auto USA / {copy.staff.team}</p>
          <h2 id="staff-heading">{copy.staff.heading}</h2>
        </div>
        <p>{copy.staff.intro}</p>
      </div>
      <div className="staff-grid">
        {staffMembers.map((member) => (
          <StaffCard key={member.id} member={member} />
        ))}
      </div>
    </section>
  );
}
