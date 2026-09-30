bool canShowRemoveMember({
  required bool groupAdmin,
  required String? currentUserId,
  required String memberUserId,
}) {
  if (!groupAdmin) return false;
  if (currentUserId == null || currentUserId.isEmpty) return false;
  return memberUserId != currentUserId;
}
