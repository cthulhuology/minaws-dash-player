Minaws DASH Player Sample
=========================

This repository demonstrates how to integrate the the open source [dashjs](https://dashjs.org/) player
with the minaws.js library.  This allows you to use browser native technologies
to access Amazon Kinesis Video streams.  The minaws.js provides a crypto.subtle
browser native implementation of the SigV4 signing algorithm for AWS API 
requests, and uses the native fetch() interface of the browser to call AWS APIs
directly.


Getting Started
---------------

In this sample repository, we create a simple nodejs server which provides the
player files and forwards temporary STS credentials from the server's 
environment.

For these credentials, in a production application you would probably use 
Amazon Cognito tied to a user's login, but for a simple demo like this, we are
just exporting temporary credentials.  For example, if we are creating a stream
named 'test' we can create an IAM role KinesisPlayerRole to grant access to it: 

```
# aws iam create-policy --policy-name KinesisPlayerPolicy \
    --policy-document file://KinesisPlayerPolicy.json
```

---
KinesisPlayerPolicy.json

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kinesisvideo:Describe*",
        "kinesisvideo:Get*",
        "kinesisvideo:List*"
      ],
      "Resource": "arn:aws:kinesisvideo:us-west-2:123456789012:stream/test/*
    }
  ]
}
```
---

To create the role we will need and assume role policy document:

---
AssumeRolePolicy.json

```
{
  "Version": "2012-10-17",
  "Statement": {
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::123456789012:role/AuthorizedUserRole"
  }
}
```
---

And then we create the role

```
# aws iam create-role --role-name KinesisPlayerRole \
  --assume-role-policy-document file://AssumeRolePolicy.json
```

We then need to attach the policy to the role

```
# aws iam attach-role-policy --role-name KinesisPlayerRole \
  --policy-arn arn:aws:iam::123456789012:policy/KinesisPlayerPolicy
```

You could then assume the role using the sts interface

```
# aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/KinesisPlayerRole \
  --role-session-name player
```


