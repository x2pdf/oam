import { ViewStyle } from 'react-native';

/** Web flex 子项默认 min-height:auto 会阻止收缩；列表/页面滚动容器需要显式约束 */
export const scrollFill: ViewStyle = { flex: 1, minHeight: 0 };
