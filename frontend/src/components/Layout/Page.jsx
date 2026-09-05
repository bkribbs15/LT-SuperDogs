import Navbar from './Navbar';

/** Navbar + centered content column. `eyebrow` is the small uppercase tag above the title. */
const Page = ({ eyebrow, icon: Icon, title, subtitle, actions, children, width = 'max-w-6xl' }) => (
  <div className="min-h-screen">
    <Navbar />
    <div className={`${width} mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12`}>
      {(title || eyebrow) && (
        <header className="mb-8 animate-fade-in">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              {eyebrow && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/60 border border-glass rounded-full mb-3">
                  {Icon && <Icon className="h-3.5 w-3.5 text-text-orange" strokeWidth={2.5} />}
                  <span className="text-[11px] font-bold text-text-orange tracking-[0.18em] uppercase">{eyebrow}</span>
                </div>
              )}
              {title && <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-wide text-text-primary">{title}</h1>}
              {subtitle && <p className="text-text-body text-lg mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>
      )}
      {children}
    </div>
  </div>
);

export default Page;
