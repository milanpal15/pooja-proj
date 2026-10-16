#!/usr/bin/env ruby
# Sanity-checks backend/render.yaml (the microservices Blueprint) against the code it deploys. Run from the repo root:
#   ruby scripts/check-render-stack.rb
# CI runs it in the `blueprints` job. It cannot prove Render accepts the file (only a sync does); it proves the things that
# have gone wrong before: a service that cannot boot because a REQUIRED variable is missing, a fromService that points nowhere,
# auto-deploy left on, a mock payment/audio provider in production, a wildcard CORS origin.
require 'yaml'

bad = []
check = ->(cond, msg) { bad << msg unless cond }

file = ARGV[0] || 'backend/render.yaml'
y = YAML.load_file(file)
services = y['services']
by_name = services.to_h { |s| [s['name'], s] }
check.(services.size == 9, "expected 9 services, found #{services.size}")

private_svcs = %w[engagement identity catalog wallet orders calls events]
bffs = { 'mobile' => 'bhakti-mobile-bff', 'admin' => 'bhakti-admin-bff' }
dirs = private_svcs.to_h { |n| ["bhakti-#{n}", "services/#{n}"] }.merge('bhakti-mobile-bff' => 'bff/mobile', 'bhakti-admin-bff' => 'bff/admin')

group = (y['envVarGroups'] || []).find { |g| g['name'] == 'bhakti-shared' }
check.(group, 'envVarGroups.bhakti-shared is missing')
group_keys = group ? group['envVars'].map { |e| e['key'] } : []
check.(group_keys.include?('INTERNAL_JWT_SECRET'), 'INTERNAL_JWT_SECRET must be in the bhakti-shared group')
check.(group_keys.include?('ADMIN_SESSION_SECRET'), 'ADMIN_SESSION_SECRET must be in the bhakti-shared group')

dirs.each do |name, dir|
  s = by_name[name]
  unless s
    bad << "service #{name} is missing"
    next
  end
  want_type = bffs.value?(name) ? 'web' : 'pserv'
  check.(s['type'] == want_type, "#{name}: type #{s['type'].inspect}, want #{want_type} (only the two BFFs are public)")
  check.(s['runtime'] == 'node', "#{name}: runtime #{s['runtime'].inspect}")
  check.(s['rootDir'] == 'backend', "#{name}: rootDir must be backend (the workspace lockfile lives there), got #{s['rootDir'].inspect}")
  check.(s['autoDeploy'] == false, "#{name}: autoDeploy must be false (CI deploys)")
  check.(s['plan'] != 'free', "#{name}: plan must not be free (see the cold-start note in the file)") if want_type == 'pserv'
  check.(s['buildCommand'].to_s.start_with?('npm ci'), "#{name}: buildCommand must be npm ci at backend/")
  check.(s['startCommand'] == "node #{dir}/src/server.js", "#{name}: startCommand is #{s['startCommand'].inspect}")
  check.(File.exist?("backend/#{dir}/src/server.js"), "#{name}: backend/#{dir}/src/server.js does not exist")
  check.(s['healthCheckPath'] == '/api/health', "#{name}: BFFs health-check /api/health (the path CI polls for the commit)") if want_type == 'web'
  env = s['envVars']
  keys = env.map { |e| e['key'] }.compact
  check.(env.any? { |e| e['fromGroup'] == 'bhakti-shared' }, "#{name}: must use the bhakti-shared group")
  node_env = env.find { |e| e['key'] == 'NODE_ENV' }
  check.(node_env && node_env['value'] == 'production', "#{name}: NODE_ENV must be production")
  check.(keys.include?('MONGODB_URI') || bffs.value?(name), "#{name}: MONGODB_URI missing")
  check.(env.none? { |e| e['key'] == 'PORT' }, "#{name}: do not set PORT, Render injects it")
  %w[PAYMENTS_PROVIDER RTC_PROVIDER].each do |k|
    e = env.find { |x| x['key'] == k }
    check.(e.nil? || e['value'].to_s != 'mock', "#{name}: #{k}=mock is refused in production")
  end
  # every REQUIRED variable in the service's own config.js is declared (directly or through the group)
  cfg = File.read("backend/#{dir}/src/config.js")
  required = cfg.scan(/name: '([A-Z_]+)'[^}]*?required: true/).flatten
  (required - keys - group_keys).each { |k| bad << "#{name}: config.js requires #{k} but the blueprint does not declare it" }
  # every fromService resolves, to the right kind of service
  env.each do |e|
    r = e['fromService'] or next
    t = by_name[r['name']]
    check.(t, "#{name}: #{e['key']} references unknown service #{r['name']}")
    check.(t && t['type'] == r['type'], "#{name}: #{e['key']} says type #{r['type']} but #{r['name']} is #{t && t['type']}") if t
    check.(r['property'] == 'hostport', "#{name}: #{e['key']} should use property hostport (host:port of a private service)")
  end
end

# the wiring each service is documented to need (docs/MICROSERVICES.md section 8)
need = {
  'bhakti-catalog' => %w[ENGAGEMENT_URL ORDERS_URL],
  'bhakti-wallet' => %w[ENGAGEMENT_URL IDENTITY_URL],
  'bhakti-orders' => %w[WALLET_URL CATALOG_URL IDENTITY_URL ENGAGEMENT_URL],
  'bhakti-calls' => %w[WALLET_URL IDENTITY_URL ENGAGEMENT_URL],
  'bhakti-events' => %w[CATALOG_URL WALLET_URL IDENTITY_URL],
  'bhakti-identity' => %w[CALLS_URL],
  'bhakti-mobile-bff' => %w[MONOLITH_URL ENGAGEMENT_URL IDENTITY_URL CATALOG_URL WALLET_URL ORDERS_URL CALLS_URL EVENTS_URL FIREBASE_PROJECT_ID],
  'bhakti-admin-bff' => %w[MONOLITH_URL ENGAGEMENT_URL IDENTITY_URL CATALOG_URL WALLET_URL ORDERS_URL CALLS_URL EVENTS_URL CORS_ORIGIN SESSION_SAMESITE],
}
need.each do |name, ks|
  keys = (by_name[name] || {})['envVars'].to_a.map { |e| e['key'] }
  (ks - keys).each { |k| bad << "#{name}: #{k} must be declared" }
end

admin = by_name['bhakti-admin-bff']
if admin
  e = admin['envVars']
  same = e.find { |x| x['key'] == 'SESSION_SAMESITE' }
  check.(same && same['value'] == 'None', 'admin BFF SESSION_SAMESITE must be None (the dashboard is cross-site)')
  cors = e.find { |x| x['key'] == 'CORS_ORIGIN' }
  check.(cors && cors['value'] != '*', "admin BFF CORS_ORIGIN must not be '*'")
end
%w[bhakti-engagement bhakti-identity bhakti-catalog bhakti-wallet bhakti-orders bhakti-calls bhakti-events].each do |n|
  check.(by_name[n] && by_name[n]['type'] == 'pserv', "#{n} must be a private service")
end

bad.each { |m| puts "::error::#{m}" }
puts(bad.empty? ? "#{file}: #{services.size} services parse and look sane" : "#{bad.size} problem(s)")
exit(bad.empty? ? 0 : 1)
