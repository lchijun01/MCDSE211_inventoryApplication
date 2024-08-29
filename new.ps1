$USERNAME = "aTlzUPH2nspWrClv"
$PASSWORD = "K8281DFaY7TFHQi0"
$HOSTNAME = "yongkhaw.com"

# Fetch your public IPv4 address
$publicIp = Invoke-RestMethod -Uri "http://ipv4.icanhazip.com"

# Update the 'A' record
$uri = "https://domains.google.com/nic/update?hostname=$HOSTNAME&myip=$publicIp"
$response = Invoke-RestMethod -Uri $uri -Method Post -Credential (New-Object System.Management.Automation.PSCredential($USERNAME, (ConvertTo-SecureString $PASSWORD -AsPlainText -Force)))

# Output the response from Google Domains
$response
